import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { query } from "@/lib/db";
import { formatMontrealDate, startOfMontrealWeek } from "@/lib/timezone";

export const BlockType = { WARMUP: "WARMUP", DRYLAND: "DRYLAND", POOL: "POOL", COOLDOWN: "COOLDOWN" } as const;
export const PoolHeight = { ONE_METER: "ONE_METER", THREE_METER: "THREE_METER", PLATFORM: "PLATFORM", CUSTOM: "CUSTOM" } as const;
export const SessionStatus = { DRAFT: "DRAFT", READY: "READY", IN_PROGRESS: "IN_PROGRESS", COMPLETED: "COMPLETED", NOT_DONE: "NOT_DONE", CANCELLED: "CANCELLED" } as const;
export const WeekStatus = { DRAFT: "DRAFT", PUBLISHED: "PUBLISHED" } as const;
export type SessionStatus = typeof SessionStatus[keyof typeof SessionStatus];
export type SessionBlockType = typeof BlockType[keyof typeof BlockType];
export type SessionPoolHeight = typeof PoolHeight[keyof typeof PoolHeight];

export const sessionTemplatePayloadSchema = z.object({
  version: z.literal(1), competitionEvaluationAtStart: z.boolean().default(false), title: z.string(), duration: z.number(), notes: z.string().nullable(),
  blocks: z.array(z.object({ type: z.enum(["WARMUP", "DRYLAND", "POOL", "COOLDOWN"]), title: z.string(), description: z.string().nullable(), duration: z.number(), position: z.number(), estimatedVolume: z.number(), competitionEvaluation: z.boolean().default(false), athleteIds: z.array(z.string()),
    drylandExercises: z.array(z.object({ exerciseId: z.string(), sets: z.number().nullable(), reps: z.number().nullable(), duration: z.number().nullable(), notes: z.string().nullable(), order: z.number() })),
    poolTraining: z.object({ sections: z.array(z.object({ height: z.enum(["ONE_METER", "THREE_METER", "PLATFORM", "CUSTOM"]), label: z.string().nullable(), dives: z.array(z.object({ diveCode: z.string(), diveName: z.string(), position: z.string(), repetitions: z.number(), notes: z.string().nullable(), order: z.number() })) })) }).nullable()
  }))
});
export type SessionTemplatePayload = z.infer<typeof sessionTemplatePayloadSchema>;

type Week = { id: string; clubId: string; groupId: string; startDate: Date; title: string; status: string };
type Dive = { id: string; poolSectionId: string; diveCode: string; diveName: string; position: string; repetitions: number; notes: string | null; postSessionModified: boolean; order: number };
type Section = { id: string; poolTrainingId: string; height: SessionPoolHeight; label: string | null; order: number; dives: Dive[] };
type Pool = { blockId: string; sections: Section[] };
type Dryland = { blockId: string; exerciseId: string; sets: number | null; reps: number | null; duration: number | null; notes: string | null; order: number };
type Assignment = { sessionBlockId: string; athleteId: string };
type Block = { id: string; sessionId: string; type: SessionBlockType; title: string; description: string | null; duration: number; position: number; estimatedVolume: number; competitionEvaluation: boolean; assignments: Assignment[]; drylandExercises: Dryland[]; poolTraining: Pool | null };
export type SessionSnapshot = { id: string; date: Date; title: string; duration: number; notes: string | null; weekId: string; coachId: string; status: SessionStatus; planningEventId: string | null; competitionEvaluationAtStart: boolean; week: Week; blocks: Block[] };
type Executor = Pick<PoolClient, "query">;
const id = () => randomUUID();

async function insertRows(tx: Executor, table: string, columns: string[], rows: unknown[][], suffix = "") {
  const batchSize = 500;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values = batch.map((row, rowIndex) =>
      `(${row.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(",")})`
    ).join(",");
    await tx.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${values}${suffix}`,
      batch.flat()
    );
  }
}

export function buildSessionTemplatePayload(session: SessionSnapshot): SessionTemplatePayload {
  return { version: 1, competitionEvaluationAtStart: session.competitionEvaluationAtStart, title: session.title, duration: session.duration, notes: session.notes,
    blocks: [...session.blocks].sort((a,b)=>a.position-b.position).map(block=>({ type:block.type,title:block.title,description:block.description,duration:block.duration,position:block.position,estimatedVolume:block.estimatedVolume,competitionEvaluation:block.competitionEvaluation,athleteIds:block.assignments.map(a=>a.athleteId),drylandExercises:[...block.drylandExercises].sort((a,b)=>a.order-b.order).map(({exerciseId,sets,reps,duration,notes,order})=>({exerciseId,sets,reps,duration,notes,order})),poolTraining:block.poolTraining?{sections:[...block.poolTraining.sections].sort((a,b)=>a.order-b.order).map(s=>({height:s.height,label:s.label,dives:[...s.dives].sort((a,b)=>a.order-b.order).map(({diveCode,diveName,position,repetitions,notes,order})=>({diveCode,diveName,position,repetitions,notes,order}))}))}:null })) };
}

export async function createSessionFromPayload(tx: Executor, data: { clubId:string; coachId:string; groupId:string; date:Date; title:string; duration:number; notes?:string|null; payload:SessionTemplatePayload; status?:SessionStatus }) {
  const athleteIds = (await tx.query<{id:string}>("SELECT id FROM \"Athlete\" WHERE \"clubId\"=$1 AND active=true AND \"groupId\"=$2",[data.clubId,data.groupId])).rows;
  const exerciseIds = (await tx.query<{id:string}>("SELECT id FROM \"DrylandExercise\" WHERE id=ANY($1::text[])",[data.payload.blocks.flatMap(b=>b.drylandExercises.map(e=>e.exerciseId))])).rows;
  const validAthletes=new Set(athleteIds.map(r=>r.id)), validExercises=new Set(exerciseIds.map(r=>r.id));
  const start = startOfMontrealWeek(data.date);
  let week=(await tx.query<Week>("SELECT id,\"clubId\",\"groupId\",\"startDate\",title,status FROM \"TrainingWeek\" WHERE \"clubId\"=$1 AND \"groupId\"=$2 AND \"startDate\"=$3 LIMIT 1",[data.clubId,data.groupId,start])).rows[0];
  if(!week){const result=await tx.query<Week>("INSERT INTO \"TrainingWeek\" (id,\"clubId\",\"groupId\",\"startDate\",title,status) VALUES ($1,$2,$3,$4,$5,'PUBLISHED') RETURNING id,\"clubId\",\"groupId\",\"startDate\",title,status",[id(),data.clubId,data.groupId,start,`Semaine du ${formatMontrealDate(start)}`]);week=result.rows[0];}
  const sessionId=id();
  const session=(await tx.query<SessionSnapshot>("INSERT INTO \"TrainingSession\" (id,date,title,duration,notes,\"weekId\",\"coachId\",status,\"competitionEvaluationAtStart\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",[sessionId,data.date,data.title,data.duration,data.notes??null,week.id,data.coachId,data.status??SessionStatus.READY,data.payload.competitionEvaluationAtStart])).rows[0];
  const blocks: unknown[][] = [], assignments: unknown[][] = [], drylandExercises: unknown[][] = [];
  const poolTrainings: unknown[][] = [], sections: unknown[][] = [], dives: unknown[][] = [];
  for(const b of data.payload.blocks){
    const blockId=id();
    blocks.push([blockId,sessionId,b.type,b.title,b.description,b.duration,b.position,b.estimatedVolume,b.competitionEvaluation]);
    for(const athleteId of b.athleteIds.filter(v=>validAthletes.has(v))) assignments.push([id(),blockId,athleteId]);
    for(const e of b.drylandExercises.filter(v=>validExercises.has(v.exerciseId))) drylandExercises.push([blockId,e.exerciseId,e.sets,e.reps,e.duration,e.notes,e.order]);
    if(b.poolTraining){
      poolTrainings.push([blockId]);
      for(const [i,s] of b.poolTraining.sections.entries()){
        const sectionId=id();
        sections.push([sectionId,blockId,s.height,s.label,i]);
        for(const d of s.dives) dives.push([id(),sectionId,d.diveCode,d.diveName,d.position,d.repetitions,d.notes,d.order]);
      }
    }
  }
  await insertRows(tx, '"SessionBlock"', ['id','"sessionId"','type','title','description','duration','position','"estimatedVolume"','"competitionEvaluation"'], blocks);
  await insertRows(tx, '"SessionBlockAssignment"', ['id','"sessionBlockId"','"athleteId"'], assignments, ' ON CONFLICT ("sessionBlockId","athleteId") DO NOTHING');
  await insertRows(tx, '"DrylandBlockExercise"', ['"blockId"','"exerciseId"','sets','reps','duration','notes','"order"'], drylandExercises, ' ON CONFLICT ("blockId","order") DO NOTHING');
  await insertRows(tx, '"PoolTraining"', ['"blockId"'], poolTrainings);
  await insertRows(tx, '"PoolSection"', ['id','"poolTrainingId"','height','label','"order"'], sections);
  await insertRows(tx, '"PoolDive"', ['id','"poolSectionId"','"diveCode"','"diveName"','position','repetitions','notes','"order"'], dives);
  return {...session,week,blocks:[]};
}

export async function getSessionSnapshot(sessionId:string,clubId:string):Promise<SessionSnapshot|null>{
 const base=(await query<SessionSnapshot>("SELECT s.id,s.date,s.title,s.duration,s.notes,s.\"weekId\",s.\"coachId\",s.status,s.\"planningEventId\",s.\"competitionEvaluationAtStart\",row_to_json(w) AS week FROM \"TrainingSession\" s JOIN \"TrainingWeek\" w ON w.id=s.\"weekId\" WHERE s.id=$1 AND w.\"clubId\"=$2",[sessionId,clubId])).rows[0]; if(!base)return null;
 const blocks=(await query<Block>("SELECT id,\"sessionId\",type,title,description,duration,position,\"estimatedVolume\",\"competitionEvaluation\" FROM \"SessionBlock\" WHERE \"sessionId\"=$1 ORDER BY position",[sessionId])).rows;
 const blockIds=blocks.map(b=>b.id);
 const [assignments,drylandExercises,pools,sections]=await Promise.all([
  query<Assignment>("SELECT \"sessionBlockId\",\"athleteId\" FROM \"SessionBlockAssignment\" WHERE \"sessionBlockId\"=ANY($1::text[])",[blockIds]),
  query<Dryland>("SELECT \"blockId\",\"exerciseId\",sets,reps,duration,notes,\"order\" FROM \"DrylandBlockExercise\" WHERE \"blockId\"=ANY($1::text[]) ORDER BY \"order\"",[blockIds]),
  query<{blockId:string}>("SELECT \"blockId\" FROM \"PoolTraining\" WHERE \"blockId\"=ANY($1::text[])",[blockIds]),
  query<Section>("SELECT id,\"poolTrainingId\",height,label,\"order\" FROM \"PoolSection\" WHERE \"poolTrainingId\"=ANY($1::text[]) ORDER BY \"order\"",[blockIds])
 ]);
 const sectionIds=sections.rows.map(s=>s.id);
 const dives=await query<Dive>("SELECT id,\"poolSectionId\",\"diveCode\",\"diveName\",position,repetitions,notes,\"postSessionModified\",\"order\" FROM \"PoolDive\" WHERE \"poolSectionId\"=ANY($1::text[]) ORDER BY \"order\"",[sectionIds]);
 const assignmentsByBlock=new Map<string,Assignment[]>(),drylandByBlock=new Map<string,Dryland[]>(),sectionsByBlock=new Map<string,Section[]>(),divesBySection=new Map<string,Dive[]>();
 for(const row of assignments.rows){const rows=assignmentsByBlock.get(row.sessionBlockId)??[];rows.push(row);assignmentsByBlock.set(row.sessionBlockId,rows);}
 for(const row of drylandExercises.rows){const rows=drylandByBlock.get(row.blockId)??[];rows.push(row);drylandByBlock.set(row.blockId,rows);}
 for(const row of sections.rows){const rows=sectionsByBlock.get(row.poolTrainingId)??[];rows.push(row);sectionsByBlock.set(row.poolTrainingId,rows);}
 for(const row of dives.rows){const rows=divesBySection.get(row.poolSectionId)??[];rows.push(row);divesBySection.set(row.poolSectionId,rows);}
 const poolBlockIds=new Set(pools.rows.map(pool=>pool.blockId));
 for(const b of blocks){
  b.assignments=assignmentsByBlock.get(b.id)??[];
  b.drylandExercises=drylandByBlock.get(b.id)??[];
  b.poolTraining=poolBlockIds.has(b.id)?{blockId:b.id,sections:(sectionsByBlock.get(b.id)??[]).map(s=>({...s,dives:divesBySection.get(s.id)??[]}))}:null;
 }
 return {...base,week:typeof base.week==="string"?JSON.parse(base.week):base.week,blocks};
}
export function parseSessionTemplatePayload(payload: unknown) { return sessionTemplatePayloadSchema.parse(payload); }
