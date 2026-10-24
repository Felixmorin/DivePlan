import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { requireCoach } from "@/lib/current-user";
import { getSessionSnapshot, type SessionSnapshot } from "@/lib/session-template";
import { startDueTrainingSessions } from "@/lib/session-status";

type RelationalRow = Record<string, unknown>;
type CoachUser = { id:string;firstName:string;lastName:string;email?:string;avatar:string|null };
type CoachAthlete = { id:string;user:CoachUser };
type SnapshotBlock = SessionSnapshot["blocks"][number];
export type CoachSession = Omit<SessionSnapshot,"week"|"blocks"> & {
  week:SessionSnapshot["week"]&{group:{id:string;name:string;clubId:string;coachId:string}};
  blocks:Array<Omit<SnapshotBlock,"assignments"|"drylandExercises">&{
    assignments:Array<{id:string;sessionBlockId:string;athleteId:string;athlete:CoachAthlete}>;
    drylandExercises:Array<SnapshotBlock["drylandExercises"][number]&{exercise:{id:string;name:string;category:string;description:string;equipment:string|null;defaultSets:number|null;defaultReps:number|null;defaultDuration:number|null;roundTrip:boolean;tags:string[]}}>;
  }>;
  completions:Array<{athleteId:string;sessionId:string;status:"NOT_STARTED"|"IN_PROGRESS"|"COMPLETED"|"SKIPPED";startedAt:Date|null;completedAt:Date|null;rating:string|null;note:string|null;athlete:CoachAthlete}>;
  absences:Array<{athleteId:string}>;
  diveLogs:Array<{id:string;athleteId:string;sessionId:string;poolDiveId:string;familyOverride:string|null;actualDiveCode:string|null;repetitionsCompleted:number;goldenRepetitions:number;rating:string;note:string|null;timestamp:Date;athlete:CoachAthlete;poolDive:Record<string,unknown>}>
  exerciseLogs:Array<{id:string;athleteId:string;sessionId:string;exerciseId:string;completed:boolean;rating:string|null;note:string|null;athlete:CoachAthlete;exercise:{name:string}}>
};

export async function getCoachSession(sessionId: string): Promise<CoachSession> {
  const { clubId } = await requireCoach();
  await startDueTrainingSessions();
  const session = await getSessionSnapshot(sessionId, clubId);
  if (!session) notFound();

  const [groupResult, completionRows, absenceRows, diveLogRows, exerciseLogRows] = await Promise.all([
    query<{group:RelationalRow}>(`SELECT jsonb_build_object('id',g.id,'name',g.name,'clubId',g."clubId",'coachId',g."coachId") AS "group" FROM "TrainingWeek" w JOIN "TrainingGroup" g ON g.id=w."groupId" WHERE w.id=$1`,[session.weekId]),
    query<{completion:RelationalRow;athlete:RelationalRow;user:RelationalRow}>(`SELECT jsonb_build_object('athleteId',c."athleteId",'sessionId',c."sessionId",'status',c.status,'startedAt',c."startedAt",'completedAt',c."completedAt",'rating',c.rating,'note',c.note) AS completion,jsonb_build_object('id',a.id) AS athlete,jsonb_build_object('id',u.id,'firstName',u."firstName",'lastName',u."lastName",'avatar',CASE WHEN u.avatar LIKE 'data:image/%' THEN NULL ELSE u.avatar END) AS "user" FROM "AthleteSessionCompletion" c JOIN "Athlete" a ON a.id=c."athleteId" JOIN "User" u ON u.id=a."userId" WHERE c."sessionId"=$1`,[session.id]),
    query<{athleteId:string}>(`SELECT "athleteId" FROM "AthleteSessionAbsence" WHERE "sessionId"=$1`,[session.id]),
    query<{log:RelationalRow;athlete:RelationalRow;user:RelationalRow;poolDive:RelationalRow}>(`SELECT jsonb_build_object('id',l.id,'athleteId',l."athleteId",'sessionId',l."sessionId",'poolDiveId',l."poolDiveId",'familyOverride',l."familyOverride",'actualDiveCode',l."actualDiveCode",'repetitionsCompleted',l."repetitionsCompleted",'goldenRepetitions',l."goldenRepetitions",'rating',l.rating,'note',l.note,'timestamp',l.timestamp) AS log,jsonb_build_object('id',a.id) AS athlete,jsonb_build_object('id',u.id,'firstName',u."firstName",'lastName',u."lastName",'avatar',NULL) AS "user",jsonb_build_object('id',d.id,'diveCode',d."diveCode",'diveName',d."diveName") AS "poolDive" FROM "AthleteDiveLog" l JOIN "Athlete" a ON a.id=l."athleteId" JOIN "User" u ON u.id=a."userId" JOIN "PoolDive" d ON d.id=l."poolDiveId" WHERE l."sessionId"=$1`,[session.id]),
    query<{log:RelationalRow;athlete:RelationalRow;user:RelationalRow;exercise:RelationalRow}>(`SELECT jsonb_build_object('id',l.id,'athleteId',l."athleteId",'sessionId',l."sessionId",'exerciseId',l."exerciseId",'completed',l.completed,'rating',l.rating,'note',l.note) AS log,jsonb_build_object('id',a.id) AS athlete,jsonb_build_object('id',u.id,'firstName',u."firstName",'lastName',u."lastName",'avatar',NULL) AS "user",jsonb_build_object('name',e.name) AS exercise FROM "AthleteExerciseLog" l JOIN "Athlete" a ON a.id=l."athleteId" JOIN "User" u ON u.id=a."userId" JOIN "DrylandExercise" e ON e.id=l."exerciseId" WHERE l."sessionId"=$1`,[session.id])
  ]);

  const blockIds = session.blocks.map((block) => block.id);
  // These IDs come only from the club-authorized snapshot. Hydrate all blocks
  // in two reads rather than two additional database round trips per block.
  const [assignmentRows, exerciseRows] = blockIds.length ? await Promise.all([
    query<{assignment:RelationalRow;athlete:RelationalRow;user:RelationalRow}>(`SELECT jsonb_build_object('id',a.id,'sessionBlockId',a."sessionBlockId",'athleteId',a."athleteId") AS assignment,jsonb_build_object('id',at.id) AS athlete,jsonb_build_object('id',u.id,'firstName',u."firstName",'lastName',u."lastName",'avatar',CASE WHEN u.avatar LIKE 'data:image/%' THEN NULL ELSE u.avatar END) AS "user" FROM "SessionBlockAssignment" a JOIN "Athlete" at ON at.id=a."athleteId" JOIN "User" u ON u.id=at."userId" WHERE a."sessionBlockId"=ANY($1::text[])`,[blockIds]),
    query<{item:RelationalRow;exercise:RelationalRow}>(`SELECT jsonb_build_object('blockId',d."blockId",'exerciseId',d."exerciseId",'sets',d.sets,'reps',d.reps,'duration',d.duration,'notes',d.notes,'order',d."order") AS item,jsonb_build_object('id',e.id,'name',e.name,'category',e.category,'description',e.description,'equipment',e.equipment,'defaultSets',e."defaultSets",'defaultReps',e."defaultReps",'defaultDuration',e."defaultDuration",'roundTrip',e."roundTrip",'tags',e.tags) AS exercise FROM "DrylandBlockExercise" d JOIN "DrylandExercise" e ON e.id=d."exerciseId" WHERE d."blockId"=ANY($1::text[]) ORDER BY d."blockId",d."order"`,[blockIds])
  ]) : [{ rows: [] }, { rows: [] }];
  const assignmentsByBlock = groupByBlock(assignmentRows.rows, (row) => String(row.assignment.sessionBlockId));
  const exercisesByBlock = groupByBlock(exerciseRows.rows, (row) => String(row.item.blockId));
  const blocks = session.blocks.map((block) => ({
    ...block,
    assignments: (assignmentsByBlock.get(block.id) ?? []).map((r) => ({ ...r.assignment, athlete: { ...r.athlete, user: r.user } })),
    drylandExercises: (exercisesByBlock.get(block.id) ?? []).map((r) => ({ ...r.item, exercise: r.exercise }))
  }));
  return {
    ...session,
    week: {...session.week,group:groupResult.rows[0]?.group},
    blocks,
    completions:completionRows.rows.map(r=>({...r.completion,athlete:{...r.athlete,user:r.user}})),
    absences:absenceRows.rows,
    diveLogs:diveLogRows.rows.map(r=>({...r.log,athlete:{...r.athlete,user:r.user},poolDive:r.poolDive})),
    exerciseLogs:exerciseLogRows.rows.map(r=>({...r.log,athlete:{...r.athlete,user:r.user},exercise:r.exercise}))
  } as unknown as CoachSession;
}

async function getAverageByCompletedTraining(athleteIds: string[], excludedSessionId: string, valueColumn: "repetitionsCompleted" | "goldenRepetitions", decimals: number) {
  if (athleteIds.length === 0) return new Map<string,number>();
  const { rows }=await query<{athleteId:string;reps:number|string;trainings:number|string}>(
    `SELECT c."athleteId",SUM(l."${valueColumn}") AS reps,COUNT(DISTINCT l."sessionId") AS trainings FROM "AthleteSessionCompletion" c JOIN "AthleteDiveLog" l ON l."athleteId"=c."athleteId" AND l."sessionId"=c."sessionId" WHERE c."athleteId"=ANY($1::text[]) AND c."sessionId"<>$2 AND c.status='COMPLETED' GROUP BY c."athleteId"`,
    [athleteIds,excludedSessionId]
  );
  return new Map(rows.map(r=>{const average=Number(r.reps)/Number(r.trainings);return [r.athleteId,decimals===0?Math.round(average):Number(average.toFixed(decimals))] as const;}));
}

export function getAthleteAverageRepsByTraining(athleteIds: string[], excludedSessionId: string) {
  return getAverageByCompletedTraining(athleteIds,excludedSessionId,"repetitionsCompleted",0);
}

export function getAthleteAverageGoldenRepsByTraining(athleteIds: string[], excludedSessionId: string) {
  return getAverageByCompletedTraining(athleteIds,excludedSessionId,"goldenRepetitions",1);
}

/** Preserve row order within each block, including the exercise order from SQL. */
function groupByBlock<T>(rows: T[], blockId: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = blockId(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}
