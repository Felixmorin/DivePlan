import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { query } from "@/lib/db";
import { formatMontrealDate, startOfMontrealWeek } from "@/lib/timezone";

export const BlockType = { WARMUP: "WARMUP", DRYLAND: "DRYLAND", POOL: "POOL", COOLDOWN: "COOLDOWN" } as const;
export const PoolHeight = { ONE_METER: "ONE_METER", THREE_METER: "THREE_METER", PLATFORM: "PLATFORM", CUSTOM: "CUSTOM" } as const;
export const SessionStatus = { DRAFT: "DRAFT", READY: "READY", COMPLETED: "COMPLETED", NOT_DONE: "NOT_DONE" } as const;
export const WeekStatus = { DRAFT: "DRAFT", PUBLISHED: "PUBLISHED" } as const;
export type SessionStatus = typeof SessionStatus[keyof typeof SessionStatus];
export type SessionBlockType = typeof BlockType[keyof typeof BlockType];
export type SessionPoolHeight = typeof PoolHeight[keyof typeof PoolHeight];

export const sessionTemplatePayloadSchema = z.object({
  version: z.literal(1), competitionEvaluationAtStart: z.boolean().default(false), title: z.string(), duration: z.number(), focus: z.string(), notes: z.string().nullable(),
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
export type SessionSnapshot = { id: string; date: Date; title: string; duration: number; focus: string; notes: string | null; weekId: string; coachId: string; status: SessionStatus; planningEventId: string | null; competitionEvaluationAtStart: boolean; week: Week; blocks: Block[] };
type Executor = Pick<PoolClient, "query">;
const id = () => randomUUID();

export function buildSessionTemplatePayload(session: SessionSnapshot): SessionTemplatePayload {
  return { version: 1, competitionEvaluationAtStart: session.competitionEvaluationAtStart, title: session.title, duration: session.duration, focus: session.focus, notes: session.notes,
    blocks: [...session.blocks].sort((a,b)=>a.position-b.position).map(block=>({ type:block.type,title:block.title,description:block.description,duration:block.duration,position:block.position,estimatedVolume:block.estimatedVolume,competitionEvaluation:block.competitionEvaluation,athleteIds:block.assignments.map(a=>a.athleteId),drylandExercises:[...block.drylandExercises].sort((a,b)=>a.order-b.order).map(({exerciseId,sets,reps,duration,notes,order})=>({exerciseId,sets,reps,duration,notes,order})),poolTraining:block.poolTraining?{sections:[...block.poolTraining.sections].sort((a,b)=>a.order-b.order).map(s=>({height:s.height,label:s.label,dives:[...s.dives].sort((a,b)=>a.order-b.order).map(({diveCode,diveName,position,repetitions,notes,order})=>({diveCode,diveName,position,repetitions,notes,order}))}))}:null })) };
}

export async function createSessionFromPayload(tx: Executor, data: { clubId:string; coachId:string; groupId:string; date:Date; title:string; duration:number; focus:string; notes?:string|null; payload:SessionTemplatePayload; status?:SessionStatus }) {
  const athleteIds = (await tx.query<{id:string}>("SELECT id FROM \"Athlete\" WHERE \"clubId\"=$1 AND active=true AND \"groupId\"=$2",[data.clubId,data.groupId])).rows;
  const exerciseIds = (await tx.query<{id:string}>("SELECT id FROM \"DrylandExercise\" WHERE id=ANY($1::text[])",[data.payload.blocks.flatMap(b=>b.drylandExercises.map(e=>e.exerciseId))])).rows;
  const validAthletes=new Set(athleteIds.map(r=>r.id)), validExercises=new Set(exerciseIds.map(r=>r.id));
  const start = startOfMontrealWeek(data.date);
  let week=(await tx.query<Week>("SELECT * FROM \"TrainingWeek\" WHERE \"clubId\"=$1 AND \"groupId\"=$2 AND \"startDate\"=$3 LIMIT 1",[data.clubId,data.groupId,start])).rows[0];
  if(!week){const result=await tx.query<Week>("INSERT INTO \"TrainingWeek\" (id,\"clubId\",\"groupId\",\"startDate\",title,status) VALUES ($1,$2,$3,$4,$5,'PUBLISHED') RETURNING *",[id(),data.clubId,data.groupId,start,`Semaine du ${formatMontrealDate(start)}`]);week=result.rows[0];}
  const sessionId=id();
  const session=(await tx.query<SessionSnapshot>("INSERT INTO \"TrainingSession\" (id,date,title,duration,focus,notes,\"weekId\",\"coachId\",status,\"competitionEvaluationAtStart\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",[sessionId,data.date,data.title,data.duration,data.focus,data.notes??null,week.id,data.coachId,data.status??SessionStatus.READY,data.payload.competitionEvaluationAtStart])).rows[0];
  for(const b of data.payload.blocks){const blockId=id(); await tx.query("INSERT INTO \"SessionBlock\" (id,\"sessionId\",type,title,description,duration,position,\"estimatedVolume\",\"competitionEvaluation\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",[blockId,sessionId,b.type,b.title,b.description,b.duration,b.position,b.estimatedVolume,b.competitionEvaluation]);
    for(const athleteId of b.athleteIds.filter(v=>validAthletes.has(v))) await tx.query("INSERT INTO \"SessionBlockAssignment\" (id,\"sessionBlockId\",\"athleteId\") VALUES ($1,$2,$3) ON CONFLICT (\"sessionBlockId\",\"athleteId\") DO NOTHING",[id(),blockId,athleteId]);
    for(const e of b.drylandExercises.filter(v=>validExercises.has(v.exerciseId))) await tx.query("INSERT INTO \"DrylandBlockExercise\" (\"blockId\",\"exerciseId\",sets,reps,duration,notes,\"order\") VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (\"blockId\",\"order\") DO NOTHING",[blockId,e.exerciseId,e.sets,e.reps,e.duration,e.notes,e.order]);
    if(b.poolTraining){await tx.query("INSERT INTO \"PoolTraining\" (\"blockId\") VALUES ($1)",[blockId]); for(const [i,s] of b.poolTraining.sections.entries()){const sectionId=id();await tx.query("INSERT INTO \"PoolSection\" (id,\"poolTrainingId\",height,label,\"order\") VALUES ($1,$2,$3,$4,$5)",[sectionId,blockId,s.height,s.label,i]);for(const d of s.dives)await tx.query("INSERT INTO \"PoolDive\" (id,\"poolSectionId\",\"diveCode\",\"diveName\",position,repetitions,notes,\"order\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",[id(),sectionId,d.diveCode,d.diveName,d.position,d.repetitions,d.notes,d.order]);}}
  }
  return {...session,week,blocks:[]};
}

export async function getSessionSnapshot(sessionId:string,clubId:string):Promise<SessionSnapshot|null>{
 const base=(await query<SessionSnapshot>("SELECT s.*, row_to_json(w) AS week FROM \"TrainingSession\" s JOIN \"TrainingWeek\" w ON w.id=s.\"weekId\" WHERE s.id=$1 AND w.\"clubId\"=$2",[sessionId,clubId])).rows[0]; if(!base)return null;
 const blocks=(await query<Block>("SELECT * FROM \"SessionBlock\" WHERE \"sessionId\"=$1 ORDER BY position",[sessionId])).rows;
 for(const b of blocks){b.assignments=(await query<Assignment>("SELECT * FROM \"SessionBlockAssignment\" WHERE \"sessionBlockId\"=$1",[b.id])).rows;b.drylandExercises=(await query<Dryland>("SELECT * FROM \"DrylandBlockExercise\" WHERE \"blockId\"=$1 ORDER BY \"order\"",[b.id])).rows;const pool=(await query<{blockId:string}>("SELECT \"blockId\" FROM \"PoolTraining\" WHERE \"blockId\"=$1",[b.id])).rows[0];b.poolTraining=pool?{...pool,sections:(await query<Section>("SELECT * FROM \"PoolSection\" WHERE \"poolTrainingId\"=$1 ORDER BY \"order\"",[b.id])).rows}:null;if(b.poolTraining)for(const s of b.poolTraining.sections)s.dives=(await query<Dive>("SELECT * FROM \"PoolDive\" WHERE \"poolSectionId\"=$1 ORDER BY \"order\"",[s.id])).rows;}
 return {...base,week:typeof base.week==="string"?JSON.parse(base.week):base.week,blocks};
}
export function parseSessionTemplatePayload(payload: unknown) { return sessionTemplatePayloadSchema.parse(payload); }
