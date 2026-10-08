import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { requireCoach } from "@/lib/current-user";
import { getSessionSnapshot, type SessionSnapshot } from "@/lib/session-template";

type RelationalRow = Record<string, unknown>;
type CoachUser = { id:string;firstName:string;lastName:string;email:string;avatar:string|null };
type CoachAthlete = { id:string;user:CoachUser };
type SnapshotBlock = SessionSnapshot["blocks"][number];
type CoachSession = Omit<SessionSnapshot,"week"|"blocks"> & {
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
  const session = await getSessionSnapshot(sessionId, clubId);
  if (!session) notFound();

  const [groupResult, completionRows, absenceRows, diveLogRows, exerciseLogRows] = await Promise.all([
    query<{group:RelationalRow}>(`SELECT to_jsonb(g) AS "group" FROM "TrainingWeek" w JOIN "TrainingGroup" g ON g.id=w."groupId" WHERE w.id=$1`,[session.weekId]),
    query<{completion:RelationalRow;athlete:RelationalRow;user:RelationalRow}>(`SELECT to_jsonb(c) AS completion,to_jsonb(a) AS athlete,to_jsonb(u) AS "user" FROM "AthleteSessionCompletion" c JOIN "Athlete" a ON a.id=c."athleteId" JOIN "User" u ON u.id=a."userId" WHERE c."sessionId"=$1`,[session.id]),
    query<{athleteId:string}>(`SELECT "athleteId" FROM "AthleteSessionAbsence" WHERE "sessionId"=$1`,[session.id]),
    query<{log:RelationalRow;athlete:RelationalRow;user:RelationalRow;poolDive:RelationalRow}>(`SELECT to_jsonb(l) AS log,to_jsonb(a) AS athlete,to_jsonb(u) AS "user",to_jsonb(d) AS "poolDive" FROM "AthleteDiveLog" l JOIN "Athlete" a ON a.id=l."athleteId" JOIN "User" u ON u.id=a."userId" JOIN "PoolDive" d ON d.id=l."poolDiveId" WHERE l."sessionId"=$1`,[session.id]),
    query<{log:RelationalRow;athlete:RelationalRow;user:RelationalRow;exercise:RelationalRow}>(`SELECT to_jsonb(l) AS log,to_jsonb(a) AS athlete,to_jsonb(u) AS "user",to_jsonb(e) AS exercise FROM "AthleteExerciseLog" l JOIN "Athlete" a ON a.id=l."athleteId" JOIN "User" u ON u.id=a."userId" JOIN "DrylandExercise" e ON e.id=l."exerciseId" WHERE l."sessionId"=$1`,[session.id])
  ]);

  const blocks = await Promise.all(session.blocks.map(async block => {
    const [assignmentRows, exerciseRows] = await Promise.all([
      query<{assignment:RelationalRow;athlete:RelationalRow;user:RelationalRow}>(`SELECT to_jsonb(a) AS assignment,to_jsonb(at) AS athlete,to_jsonb(u) AS "user" FROM "SessionBlockAssignment" a JOIN "Athlete" at ON at.id=a."athleteId" JOIN "User" u ON u.id=at."userId" WHERE a."sessionBlockId"=$1`,[block.id]),
      query<{item:RelationalRow;exercise:RelationalRow}>(`SELECT to_jsonb(d) AS item,to_jsonb(e) AS exercise FROM "DrylandBlockExercise" d JOIN "DrylandExercise" e ON e.id=d."exerciseId" WHERE d."blockId"=$1 ORDER BY d."order"`,[block.id])
    ]);
    return {
      ...block,
      assignments: assignmentRows.rows.map(r=>({...r.assignment,athlete:{...r.athlete,user:r.user}})),
      drylandExercises: exerciseRows.rows.map(r=>({...r.item,exercise:r.exercise}))
    };
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
