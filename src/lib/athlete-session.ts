import { PAGE_SIZE, pageNumber } from "./pagination";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/lib/db";
import { countPoolContexts } from "@/lib/pool-list";
import { addMontrealDays, startOfMontrealDay, startOfMontrealWeek, toMontrealDateInputValue } from "@/lib/timezone";

const PoolHeight = { ONE_METER: "ONE_METER", THREE_METER: "THREE_METER", PLATFORM: "PLATFORM", CUSTOM: "CUSTOM" } as const;
type PoolHeight = typeof PoolHeight[keyof typeof PoolHeight];

export type AthleteSessionExercise = {
  id: string;
  name: string;
  category: string;
  sets: number | null;
  reps: number | null;
  duration: number | null;
  roundTrip: boolean;
  equipment: string | null;
  completed: boolean;
  rating: string | null;
  note: string | null;
};

export type AthleteSessionDive = {
  id: string;
  code: string;
  postSessionModified: boolean;
  actualCode: string | null;
  name: string;
  repetitions: number;
  actualRepetitions: number | null;
  completedRepetitions: number;
  goldenRepetitions: number;
  feedbackCompleted: boolean;
  personalNote: string | null;
  rating: string | null;
  note: string | null;
};

export type AthleteSessionBlock = {
  id: string;
  title: string;
  description: string | null;
  type: "WARMUP" | "DRYLAND" | "POOL" | "COOLDOWN" | "CUSTOM";
  duration: number;
  volume: number;
  exercises: AthleteSessionExercise[];
  poolSections: Array<{
    id: string;
    label: string;
    height: PoolHeight;
    dives: AthleteSessionDive[];
  }>;
};

export type AthleteSessionView = {
  id: string;
  sessionStatus: string;
  title: string;
  date: string;
  duration: number;
  group: string;
  notes: string | null;
  completionStatus: string;
  finalRating: string | null;
  finalNote: string | null;
  blocks: AthleteSessionBlock[];
  competitionEvaluationAtStart: boolean;
  competitionEvaluationBlockIds: string[];
  competitionDives: Array<{ id: string; code: string; height: PoolHeight; platformHeight: number | null; listId: string; listName: string }>;
  competitionEvaluations: Array<{ competitionDiveId: string; rating: number }>;
};

export type AthleteProgressTotals = {
  readyScore: number;
  completedSessions: number;
  totalDiveRepetitions: number;
  completedExercises: number;
  completedMinutes: number;
  thisWeekSessions: number;
  thisWeekDiveRepetitions: number;
  thisWeekMinutes: number;
  completionRate: number;
  recentNote: string;
  chartData: Array<{ name: string; volume: number }>;
  dailyFamilyChartData: Array<{ name: string; volume: number; familyVolumes: Record<string, number> }>;
  sessionChartData: Array<{ name: string; volume: number; finalRating: string | null }>;
  weeklyChartData: Array<{ name: string; volume: number }>;
  monthlyChartData: Array<{ name: string; volume: number }>;
  skillData: Array<{ name: string; volume: number }>;
  skillDives: Array<{ category: string; code: string; name: string; height: PoolHeight; heightLabel: string | null; volume: number }>;
  skillCategories: string[];
};

export type AthleteGoldenRep = {
  code: string;
  name: string;
  height: PoolHeight;
  count: number;
};

export type AthleteRecentCompletion = {
  sessionId: string;
  title: string;
  duration: number;
  completedAt: string | null;
  status: string;
};

export type AthleteCurrentWeekSummary = {
  total: number;
  completed: number;
  remaining: number;
  plannedMinutes: number;
  completedMinutes: number;
  volume: number;
};

type CurrentUser = {id:string;firstName:string;lastName:string;email:string;username:string|null;avatar:string|null;role:"ADMIN"|"COACH"|"ATHLETE";clubId:string|null;passwordHash:string|null;passwordSetAt:Date|null;createdAt:Date};
type CurrentAthlete = {id:string;userId:string;clubId:string;groupId:string|null;birthDate:Date;level:string;active:boolean;user:CurrentUser;club:{id:string;name:string;logo:string|null;createdAt:Date};group:({id:string;name:string;clubId:string;coachId:string;coach:{id:string;userId:string;clubId:string;planningDefaultView:string;weekStartsOn:number;printShowCoachNotes:boolean;printShowAthleteNames:boolean;printRepetitionChecks:boolean;user:CurrentUser}})|null;competitionDives:Array<{id:string;athleteId:string;height:PoolHeight;platformHeight:number|null;diveCode:string;diveName:string;difficulty:number|null;position:number;createdAt:Date}>};

// Profile photos are disabled (resolveAvatarUrls always returns null). Project
// user fields explicitly so legacy inline photos never cross the DB connection.
const currentAthleteUserProjection = (alias: "u" | "cu") => `jsonb_build_object(
  'id', ${alias}.id, 'firstName', ${alias}."firstName", 'lastName', ${alias}."lastName",
  'email', ${alias}.email, 'username', ${alias}.username, 'avatar', NULL::text,
  'role', ${alias}.role, 'clubId', ${alias}."clubId", 'passwordHash', ${alias}."passwordHash",
  'passwordSetAt', ${alias}."passwordSetAt", 'createdAt', ${alias}."createdAt")`;

// Keep the same authentication/password guard for both profile and identity reads.
async function getAuthenticatedAthleteUser() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ATHLETE") return null;
  if (!user.passwordSetAt) redirect("/change-password");
  return user;
}

/** Progress saves need only the athlete ID, not the group, coach or profile. */
export async function getCurrentAthleteIdentity(): Promise<{ id: string } | null> {
  const user = await getAuthenticatedAthleteUser();
  if (!user) return null;
  // Preserve the profile loader's requirement for an existing athlete and club.
  const { rows } = await query<{ id: string }>(
    `SELECT a.id FROM "Athlete" a JOIN "Club" c ON c.id=a."clubId" WHERE a."userId"=$1`,
    [user.id]
  );
  return rows[0] ?? null;
}

type CurrentAthleteWithoutCompetitionDives = Omit<CurrentAthlete, "competitionDives">;

export function getCurrentAthlete(options: { includeCompetitionDives: false }): Promise<CurrentAthleteWithoutCompetitionDives | null>;
export function getCurrentAthlete(options?: { includeCompetitionDives?: true }): Promise<CurrentAthlete | null>;
export async function getCurrentAthlete(options: { includeCompetitionDives?: boolean } = {}): Promise<CurrentAthlete | CurrentAthleteWithoutCompetitionDives | null> {
  const user = await getAuthenticatedAthleteUser();
  if (!user) return null;

  const base=(await query<{athlete:CurrentAthlete;user:CurrentAthlete["user"];club:CurrentAthlete["club"];group:CurrentAthlete["group"]}>(`SELECT to_jsonb(a) AS athlete,${currentAthleteUserProjection("u")} AS "user",to_jsonb(c) AS club,to_jsonb(g) AS "group" FROM "Athlete" a JOIN "User" u ON u.id=a."userId" JOIN "Club" c ON c.id=a."clubId" LEFT JOIN "TrainingGroup" g ON g.id=a."groupId" WHERE a."userId"=$1`,[user.id])).rows[0];
  if(!base)return null;
  const coach=base.group?.coachId?(await query<{coach:NonNullable<CurrentAthlete["group"]>["coach"];user:CurrentUser}>(`SELECT to_jsonb(co) AS coach,${currentAthleteUserProjection("cu")} AS "user" FROM "Coach" co JOIN "User" cu ON cu.id=co."userId" WHERE co.id=$1`,[base.group.coachId])).rows[0]:null;
  const profile = {...base.athlete,user:base.user,club:base.club,group:base.group?{...base.group,coach:coach?{...coach.coach,user:coach.user}:null}:null} as CurrentAthleteWithoutCompetitionDives;
  // Session mutations and progress saves do not use this list. Keep the default
  // full profile for competition, badges and edit pages that do consume it.
  if (options.includeCompetitionDives === false) return profile;
  const competitionDives=(await query<CurrentAthlete["competitionDives"][number]>(`SELECT d.* FROM "CompetitionDive" d JOIN "CompetitionDiveList" l ON l.id=d."listId" WHERE d."athleteId"=$1 AND l.position=0 ORDER BY d.height,d.position,d."createdAt"`,[base.athlete.id])).rows;
  return {...profile,competitionDives};
}

export async function getAssignedReadySession(athleteId: string): Promise<{id:string;date:Date;title:string;duration:number;sessionStatus:string;completions:{status:string}[];blocks:{estimatedVolume:number;type:string}[]}|null> {
  const today = startOfMontrealDay();
  const session=(await query<{id:string;date:Date;title:string;duration:number;sessionStatus:string}>(`SELECT s.id,s.date,s.title,COALESCE(pe.duration,s.duration) AS duration,s.status AS "sessionStatus" FROM "TrainingSession" s LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" WHERE s.status IN ('READY','IN_PROGRESS') AND (s.status='IN_PROGRESS' OR s.date >= $1) AND EXISTS (SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id WHERE b."sessionId"=s.id AND a."athleteId"=$2) ORDER BY CASE WHEN s.status='IN_PROGRESS' THEN 0 ELSE 1 END,s.date ASC LIMIT 1`,[today,athleteId])).rows[0];
  if(!session)return null;
  const [completions,blocks]=await Promise.all([
    query<{status:string}>(`SELECT status FROM "AthleteSessionCompletion" WHERE "sessionId"=$1 AND "athleteId"=$2`,[session.id,athleteId]),
    query<{estimatedVolume:number;type:string}>(`SELECT b."estimatedVolume",b.type FROM "SessionBlock" b WHERE b."sessionId"=$1 AND EXISTS (SELECT 1 FROM "SessionBlockAssignment" a WHERE a."sessionBlockId"=b.id AND a."athleteId"=$2) ORDER BY b.position`,[session.id,athleteId])
  ]);
  return {...session,completions:completions.rows,blocks:blocks.rows};
}

export async function getAthleteCompletionPage(athleteId: string, requestedPage: unknown) {
  const count = await query<{total:number}>(`SELECT COUNT(*)::int AS total FROM "AthleteSessionCompletion" c JOIN "TrainingSession" s ON s.id=c."sessionId" WHERE c."athleteId"=$1`,[athleteId]);
  const total = count.rows[0]?.total ?? 0;
  const page = Math.min(pageNumber(requestedPage),Math.max(1,Math.ceil(total/PAGE_SIZE)));
  return {total,page,completions:await getAthleteRecentCompletions(athleteId,page)};
}

export async function getAthleteRecentCompletions(athleteId: string, page = 1): Promise<AthleteRecentCompletion[]> {
  const {rows:completions}=await query<{sessionId:string;title:string;duration:number;completedAt:Date|null;startedAt:Date|null;status:string}>(`SELECT c."sessionId",s.title,COALESCE(pe.duration,s.duration) AS duration,c."completedAt",c."startedAt",c.status FROM "AthleteSessionCompletion" c JOIN "TrainingSession" s ON s.id=c."sessionId" LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" WHERE c."athleteId"=$1 ORDER BY c."completedAt" DESC NULLS LAST,c."startedAt" DESC NULLS LAST,c."sessionId" DESC LIMIT $2 OFFSET $3`,[athleteId,PAGE_SIZE,(page-1)*PAGE_SIZE]);

  return completions.map((completion) => ({
    sessionId: completion.sessionId,
    title: completion.title,
    duration: completion.duration,
    completedAt: completion.completedAt?.toISOString() ?? completion.startedAt?.toISOString() ?? null,
    status: completion.status
  }));
}

export async function getAthleteSession(sessionId: string, athleteId: string): Promise<AthleteSessionView | null> {
  const session=(await query<{id:string;title:string;date:Date;duration:number;notes:string|null;competitionEvaluationAtStart:boolean;groupName:string;sessionStatus:string;completionStatus:string|null;rating:string|null;note:string|null}>(`SELECT s.id,s.title,s.date,COALESCE(pe.duration,s.duration) AS duration,s.notes,s."competitionEvaluationAtStart",g.name AS "groupName",s.status AS "sessionStatus",c.status AS "completionStatus",c.rating,c.note FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "TrainingGroup" g ON g.id=w."groupId" LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" LEFT JOIN "AthleteSessionCompletion" c ON c."sessionId"=s.id AND c."athleteId"=$2 WHERE s.id=$1 AND (s.status IN ('READY','IN_PROGRESS') OR (s.status='COMPLETED' AND c.status IN ('IN_PROGRESS','COMPLETED'))) AND EXISTS (SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id WHERE b."sessionId"=s.id AND a."athleteId"=$2)`,[sessionId,athleteId])).rows[0];
  if (!session) return null;
  const blocks=(await query<{id:string;title:string;description:string|null;type:AthleteSessionBlock["type"];duration:number;estimatedVolume:number;competitionEvaluation:boolean}>(`SELECT b.id,b.title,b.description,b.type,b.duration,b."estimatedVolume",b."competitionEvaluation" FROM "SessionBlock" b WHERE b."sessionId"=$1 AND EXISTS (SELECT 1 FROM "SessionBlockAssignment" a WHERE a."sessionBlockId"=b.id AND a."athleteId"=$2) ORDER BY b.position`,[sessionId,athleteId])).rows;
  const [competitionDives,competitionEvaluations]=await Promise.all([
    query<{id:string;diveCode:string;height:PoolHeight;platformHeight:number|null;listId:string;listName:string}>(`SELECT d.id,d."diveCode",d.height,d."platformHeight",l.id AS "listId",l.name AS "listName" FROM "CompetitionDive" d JOIN "CompetitionDiveList" l ON l.id=d."listId" WHERE d."athleteId"=$1 AND l.position=0 ORDER BY d.height,d.position,d."createdAt"`,[athleteId]),
    query<{competitionDiveId:string;rating:number}>(`SELECT "competitionDiveId",rating FROM "AthleteCompetitionDiveEvaluation" WHERE "athleteId"=$1 AND "sessionId"=$2 AND evaluator='ATHLETE'`,[athleteId,sessionId])
  ]);
  const blockIds=blocks.map(block=>block.id);
  const [exercises,sections]=blockIds.length?await Promise.all([
    query<{blockId:string;id:string;name:string;category:string;sets:number|null;reps:number|null;itemDuration:number|null;roundTrip:boolean;equipment:string|null;completed:boolean|null;rating:string|null;note:string|null}>(`SELECT d."blockId",e.id,e.name,e.category,d.sets,d.reps,d.duration AS "itemDuration",e."roundTrip",e.equipment,l.completed,l.rating,l.note FROM "DrylandBlockExercise" d JOIN "DrylandExercise" e ON e.id=d."exerciseId" LEFT JOIN "AthleteExerciseLog" l ON l."exerciseId"=e.id AND l."athleteId"=$2 AND l."sessionId"=$3 WHERE d."blockId"=ANY($1::text[]) ORDER BY d."blockId",d."order"`,[blockIds,athleteId,sessionId]),
    query<{id:string;poolTrainingId:string;label:string|null;height:PoolHeight}>(`SELECT s.id,s."poolTrainingId",s.label,s.height FROM "PoolSection" s WHERE s."poolTrainingId"=ANY($1::text[]) ORDER BY s."poolTrainingId",s."order"`,[blockIds])
  ]):[{rows:[] as {blockId:string;id:string;name:string;category:string;sets:number|null;reps:number|null;itemDuration:number|null;roundTrip:boolean;equipment:string|null;completed:boolean|null;rating:string|null;note:string|null}[]},{rows:[] as {id:string;poolTrainingId:string;label:string|null;height:PoolHeight}[]}];
  const exercisesByBlock=new Map<string,typeof exercises.rows>();
  for(const exercise of exercises.rows){const rows=exercisesByBlock.get(exercise.blockId)??[];rows.push(exercise);exercisesByBlock.set(exercise.blockId,rows);}
  const dives=sections.rows.length?await query<{poolSectionId:string;id:string;diveCode:string;diveName:string;repetitions:number;postSessionModified:boolean;actualDiveCode:string|null;completedRepetitions:number|null;goldenRepetitions:number|null;feedbackCompleted:boolean|null;rating:string|null;note:string|null;personalNote:string|null}>(`SELECT d."poolSectionId",d.id,d."diveCode",d."diveName",d.repetitions,d."postSessionModified",l."actualDiveCode",l."repetitionsCompleted" AS "completedRepetitions",l."goldenRepetitions",l."feedbackCompleted",l.rating,l.note,n.note AS "personalNote" FROM "PoolDive" d LEFT JOIN "AthleteDiveLog" l ON l."poolDiveId"=d.id AND l."athleteId"=$2 AND l."sessionId"=$3 LEFT JOIN "AthleteDiveNote" n ON n."poolDiveId"=d.id AND n."athleteId"=$2 WHERE d."poolSectionId"=ANY($1::text[]) ORDER BY d."poolSectionId",d."order"`,[sections.rows.map(section=>section.id),athleteId,sessionId]):{rows:[] as {poolSectionId:string;id:string;diveCode:string;diveName:string;repetitions:number;postSessionModified:boolean;actualDiveCode:string|null;completedRepetitions:number|null;goldenRepetitions:number|null;feedbackCompleted:boolean|null;rating:string|null;note:string|null;personalNote:string|null}[]};
  const divesBySection=new Map<string,typeof dives.rows>();
  for(const dive of dives.rows){const rows=divesBySection.get(dive.poolSectionId)??[];rows.push(dive);divesBySection.set(dive.poolSectionId,rows);}
  const sectionsByBlock=new Map<string,typeof sections.rows>();
  for(const section of sections.rows){const rows=sectionsByBlock.get(section.poolTrainingId)??[];rows.push(section);sectionsByBlock.set(section.poolTrainingId,rows);}

  return {
    id: session.id,
    sessionStatus: session.sessionStatus,
    title: session.title,
    date: session.date.toISOString(),
    duration: session.duration,
    group: session.groupName,
    notes: session.notes,
    completionStatus: session.completionStatus ?? "NOT_STARTED",
    finalRating: session.rating ?? null,
    finalNote: session.note ?? null,
    competitionEvaluationAtStart: session.competitionEvaluationAtStart,
    competitionEvaluationBlockIds: blocks.filter((block) => block.competitionEvaluation).map((block) => block.id),
    competitionDives: competitionDives.rows.map((dive) => ({ id: dive.id, code: dive.diveCode, height: dive.height, platformHeight: dive.platformHeight, listId: dive.listId, listName: dive.listName })),
    competitionEvaluations:competitionEvaluations.rows,
    blocks: blocks.map((block) => {
      const blockExercises=exercisesByBlock.get(block.id)??[];
      const poolSections=(sectionsByBlock.get(block.id)??[]).map(section=>({id:section.id,label:section.label??poolHeightLabel(section.height),height:section.height,dives:(divesBySection.get(section.id)??[]).map(dive=>({id:dive.id,code:dive.diveCode,postSessionModified:dive.postSessionModified,actualCode:dive.actualDiveCode??null,name:dive.diveName,repetitions:dive.repetitions*Math.max(1,countPoolContexts(section.label??poolHeightLabel(section.height))),actualRepetitions:dive.actualDiveCode!==null?(dive.completedRepetitions??0):null,completedRepetitions:dive.completedRepetitions??0,goldenRepetitions:dive.goldenRepetitions??0,feedbackCompleted:dive.feedbackCompleted??false,personalNote:dive.personalNote??null,rating:dive.rating??null,note:dive.note??null}))}));
      return {
      id: block.id,
      title: block.title,
      description: block.description,
      type: block.type,
      duration: block.duration,
      volume: block.estimatedVolume,
      exercises:blockExercises.map(item=>({id:item.id,name:item.name,category:item.category,sets:item.sets,reps:item.reps,duration:item.itemDuration,roundTrip:item.roundTrip,equipment:item.equipment,completed:item.completed??false,rating:item.rating??null,note:item.note??null})),
      poolSections
      };
    })
  };
}

/** Small projection for profile counters and badges; no chart/history hydration. */
export async function getAthleteSummary(athleteId: string) {
  const { rows } = await query<{ completedSessions: number; totalDiveRepetitions: number; completedMinutes: number }>(`
    SELECT
      (SELECT COUNT(*)::int FROM "AthleteSessionCompletion" WHERE "athleteId"=$1 AND status='COMPLETED') AS "completedSessions",
      (SELECT COALESCE(SUM("repetitionsCompleted"),0)::int FROM "AthleteDiveLog" WHERE "athleteId"=$1) AS "totalDiveRepetitions",
      (SELECT COALESCE(SUM(COALESCE(pe.duration,s.duration)),0)::int FROM "TrainingSession" s
       LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId"
       WHERE s.status IN ('READY','IN_PROGRESS','COMPLETED') AND s.date<=NOW()
       AND EXISTS (SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id WHERE b."sessionId"=s.id AND a."athleteId"=$1)
       AND NOT EXISTS (SELECT 1 FROM "AthleteSessionAbsence" a WHERE a."sessionId"=s.id AND a."athleteId"=$1)) AS "completedMinutes"`, [athleteId]);
  return rows[0];
}

export async function getAthleteProgressTotals(athleteId: string, chartsOnly = false): Promise<AthleteProgressTotals> {
  const summaryQuery = <Row extends import("pg").QueryResultRow>(sql: string, values: unknown[]) => chartsOnly ? Promise.resolve({rows: [] as Row[]}) : query<Row>(sql,values);
  const weekStart = startOfMontrealWeek();
  const weekEnd = addMontrealDays(weekStart, 7);
  const [completionCountResult, recentCompletionRows, assignedResult, attendanceResult, diveTotalsResult, dailyDiveRows, dailyFamilyRows, skillDiveRows, exerciseResult, skillRows] = await Promise.all([
    summaryQuery<{count:number;thisWeek:number}>(`SELECT COUNT(*)::int AS count,COUNT(*) FILTER (WHERE "completedAt">=$2 AND "completedAt"<$3)::int AS "thisWeek" FROM "AthleteSessionCompletion" WHERE "athleteId"=$1 AND status='COMPLETED'`,[athleteId,weekStart,weekEnd]),
    query<{sessionId:string;completedAt:Date|null;rating:string|null;duration:number}>(`SELECT c."sessionId",c."completedAt",c.rating,COALESCE(pe.duration,s.duration) AS duration FROM "AthleteSessionCompletion" c JOIN "TrainingSession" s ON s.id=c."sessionId" LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" WHERE c."athleteId"=$1 AND c.status='COMPLETED' ORDER BY c."completedAt" DESC NULLS LAST LIMIT 8`,[athleteId]),
    summaryQuery<{count:number}>(`SELECT COUNT(DISTINCT s.id)::int AS count FROM "TrainingSession" s WHERE EXISTS (SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id WHERE b."sessionId"=s.id AND a."athleteId"=$1)`,[athleteId]),
    summaryQuery<{completedMinutes:number;thisWeekMinutes:number}>(`SELECT COALESCE(SUM(COALESCE(pe.duration,s.duration)) FILTER (WHERE s.date <= NOW()),0)::int AS "completedMinutes",COALESCE(SUM(COALESCE(pe.duration,s.duration)) FILTER (WHERE s.date >= $2 AND s.date < $3 AND s.date <= NOW()),0)::int AS "thisWeekMinutes" FROM "TrainingSession" s LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" WHERE s.status IN ('READY','IN_PROGRESS','COMPLETED') AND EXISTS (SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id WHERE b."sessionId"=s.id AND a."athleteId"=$1) AND NOT EXISTS (SELECT 1 FROM "AthleteSessionAbsence" absence WHERE absence."athleteId"=$1 AND absence."sessionId"=s.id)`,[athleteId,weekStart,weekEnd]),
    summaryQuery<{total:number;thisWeek:number}>(`SELECT COALESCE(SUM("repetitionsCompleted"),0)::int AS total,COALESCE(SUM("repetitionsCompleted") FILTER (WHERE timestamp >= $2 AND timestamp < $3),0)::int AS "thisWeek" FROM "AthleteDiveLog" WHERE "athleteId"=$1`,[athleteId,weekStart,weekEnd]),
    query<{date:Date;volume:number}>(`SELECT MIN(timestamp) AS date,SUM("repetitionsCompleted")::int AS volume FROM "AthleteDiveLog" WHERE "athleteId"=$1 GROUP BY (timestamp AT TIME ZONE 'America/Toronto')::date ORDER BY (timestamp AT TIME ZONE 'America/Toronto')::date`,[athleteId]),
    query<{date:Date;category:string;volume:number}>(`SELECT MIN(l.timestamp) AS date,COALESCE(l."familyOverride",CASE left(d."diveCode",1) WHEN '1' THEN 'Avant' WHEN '2' THEN 'Arriere' WHEN '3' THEN 'Renverse' WHEN '4' THEN 'Retourne' WHEN '5' THEN 'Vrille' ELSE 'Equilibre' END) AS category,SUM(l."repetitionsCompleted")::int AS volume FROM "AthleteDiveLog" l JOIN "PoolDive" d ON d.id=l."poolDiveId" WHERE l."athleteId"=$1 GROUP BY (l.timestamp AT TIME ZONE 'America/Toronto')::date,category ORDER BY (l.timestamp AT TIME ZONE 'America/Toronto')::date`,[athleteId]),
    query<{category:string;code:string;name:string;height:PoolHeight;heightLabel:string|null;volume:number}>(`SELECT COALESCE(l."familyOverride",CASE left(d."diveCode",1) WHEN '1' THEN 'Avant' WHEN '2' THEN 'Arriere' WHEN '3' THEN 'Renverse' WHEN '4' THEN 'Retourne' WHEN '5' THEN 'Vrille' ELSE 'Equilibre' END) AS category,d."diveCode" AS code,COALESCE(l."actualDiveName",d."diveName") AS name,s.height,s.label AS "heightLabel",SUM(l."repetitionsCompleted")::int AS volume FROM "AthleteDiveLog" l JOIN "PoolDive" d ON d.id=l."poolDiveId" JOIN "PoolSection" s ON s.id=d."poolSectionId" WHERE l."athleteId"=$1 GROUP BY category,d."diveCode",name,s.height,s.label`,[athleteId]),
    summaryQuery<{count:number}>(`SELECT COUNT(*)::int AS count FROM "AthleteExerciseLog" WHERE "athleteId"=$1 AND completed=true`,[athleteId]),
    summaryQuery<{category:string}>(`SELECT DISTINCT s.category FROM "AthleteSkill" a JOIN "Skill" s ON s.id=a."skillId" WHERE a."athleteId"=$1`,[athleteId])
  ]);
  const completedSessions=recentCompletionRows.rows.map(row=>({...row,session:{duration:row.duration}}));
  const assignedSessions=assignedResult.rows[0]?.count??0;
  const recentIds=recentCompletionRows.rows.map(row=>row.sessionId);
  const recentDiveVolumes=recentIds.length?await query<{sessionId:string;volume:number}>(`SELECT "sessionId",SUM("repetitionsCompleted")::int AS volume FROM "AthleteDiveLog" WHERE "athleteId"=$1 AND "sessionId"=ANY($2::text[]) GROUP BY "sessionId"`,[athleteId,recentIds]):{rows:[] as Array<{sessionId:string;volume:number}>};
  const sessionVolumes=new Map(recentDiveVolumes.rows.map(row=>[row.sessionId,row.volume]));
  const completedExercises=exerciseResult.rows[0]?.count??0;
  const chartTotals = new Map<string, number>([
    ["Avant", 0],
    ["Arriere", 0],
    ["Renverse", 0],
    ["Retourne", 0],
    ["Vrille", 0],
    ["Equilibre", 0]
  ]);
  const skillDives = skillDiveRows.rows.map(row => ({category:row.category,code:row.code,name:row.name,height:row.height,heightLabel:row.heightLabel,volume:row.volume}));
  for (const dive of skillDives) {
    chartTotals.set(dive.category, (chartTotals.get(dive.category) ?? 0) + dive.volume);
  }

  const completedMinutes = attendanceResult.rows[0]?.completedMinutes ?? 0;
  const completedSessionCount = completionCountResult.rows[0]?.count ?? 0;
  const totalDiveRepetitions = diveTotalsResult.rows[0]?.total ?? 0;
  const completionRate = assignedSessions > 0 ? Math.round((completedSessionCount / assignedSessions) * 100) : 0;
  const readyScore = Math.min(100, Math.round(completionRate * 0.6 + Math.min(totalDiveRepetitions, 120) * 0.25 + Math.min(completedExercises, 20) * 0.5));
  const dailyData = dailyDiveRows.rows;
  const dailyByKey = new Map<string, Record<string, number>>();
  for (const row of dailyFamilyRows.rows) {
    const key = toMontrealDateInputValue(row.date);
    const volumes = dailyByKey.get(key) ?? {};
    volumes[row.category] = (volumes[row.category] ?? 0) + row.volume;
    dailyByKey.set(key, volumes);
  }
  const dailyFamilyChartData = dailyData.slice(-6).map(({ date, volume }) => ({
    name: new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", weekday: "short", day: "numeric", month: "short" }).format(date),
    volume,
    familyVolumes: dailyByKey.get(toMontrealDateInputValue(date)) ?? {}
  }));
  const weeklyData = averageByPeriod(dailyData, "week");
  const monthlyData = averageByPeriod(dailyData, "month");

  return {
    readyScore,
    completedSessions: completedSessionCount,
    totalDiveRepetitions,
    completedExercises,
    completedMinutes,
    thisWeekSessions: completionCountResult.rows[0]?.thisWeek ?? 0,
    thisWeekDiveRepetitions: diveTotalsResult.rows[0]?.thisWeek ?? 0,
    thisWeekMinutes: attendanceResult.rows[0]?.thisWeekMinutes ?? 0,
    completionRate,
    recentNote: "Complete une seance pour generer une tendance.",
    chartData: dailyData
      .slice(-6)
      .map(({ date, volume }) => ({
        name: new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", weekday: "short", day: "numeric", month: "short" }).format(date),
        volume
      })),
    dailyFamilyChartData,
    sessionChartData: completedSessions
      .filter((completion) => completion.completedAt !== null)
      .slice()
      .sort((a, b) => a.completedAt!.getTime() - b.completedAt!.getTime())
      .slice(-8)
      .map((completion) => ({
        name: new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", day: "numeric", month: "short" }).format(completion.completedAt!),
        volume: sessionVolumes.get(completion.sessionId) ?? 0,
        finalRating: completion.rating
      })),
    weeklyChartData: weeklyData,
    monthlyChartData: monthlyData,
    skillData: Array.from(chartTotals, ([name, volume]) => ({ name, volume })),
    skillDives: Array.from(skillDives.values()).sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code) || a.height.localeCompare(b.height)),
    skillCategories: Array.from(new Set(skillRows.rows.map((skill) => skill.category)))
  };
}

export async function getAthleteGoldenReps(athleteId: string): Promise<AthleteGoldenRep[]> {
  const { rows } = await query<AthleteGoldenRep>(`SELECT s.height,d."diveCode" AS code,d."diveName" AS name,SUM(l."goldenRepetitions")::int AS count FROM "AthleteDiveLog" l JOIN "PoolDive" d ON d.id=l."poolDiveId" JOIN "PoolSection" s ON s.id=d."poolSectionId" WHERE l."athleteId"=$1 AND l."goldenRepetitions">0 GROUP BY s.height,d."diveCode",d."diveName" ORDER BY count DESC,code`,[athleteId]);
  return rows;
}

export async function getAthleteCurrentWeekSummary(athleteId: string): Promise<AthleteCurrentWeekSummary> {
  const weekStart = startOfMontrealWeek();
  const weekEnd = addMontrealDays(weekStart, 7);
  const {rows:sessions}=await query<{date:Date;duration:number;completionStatus:string|null;present:boolean;volume:number}>(`SELECT s.date,COALESCE(pe.duration,s.duration) AS duration,c.status AS "completionStatus",NOT EXISTS (SELECT 1 FROM "AthleteSessionAbsence" absence WHERE absence."athleteId"=$1 AND absence."sessionId"=s.id) AS present,COALESCE((SELECT SUM(l."repetitionsCompleted") FROM "AthleteDiveLog" l WHERE l."sessionId"=s.id AND l."athleteId"=$1),0)::int AS volume FROM "TrainingSession" s LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" LEFT JOIN "AthleteSessionCompletion" c ON c."sessionId"=s.id AND c."athleteId"=$1 WHERE s.date >= $2 AND s.date < $3 AND s.status IN ('READY','IN_PROGRESS','COMPLETED') AND EXISTS (SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id WHERE b."sessionId"=s.id AND a."athleteId"=$1)`,[athleteId,weekStart,weekEnd]);
  const completed = sessions.filter((session) => session.completionStatus === "COMPLETED").length;
  return {
    total: sessions.length,
    completed,
    remaining: Math.max(0, sessions.length - completed),
    plannedMinutes: sessions.reduce((sum, session) => sum + session.duration, 0),
    completedMinutes: sessions
      .filter((session) => session.present && session.date <= new Date())
      .reduce((sum, session) => sum + session.duration, 0),
    volume: sessions
      .filter((session) => session.date <= new Date())
      .reduce((sum, session) => sum + session.volume, 0)
  };
}

function averageByPeriod(data: Array<{ date: Date; volume: number }>, period: "week" | "month") {
  const grouped = new Map<string, { date: Date; volume: number; days: number }>();

  for (const entry of data) {
    const date = new Date(entry.date);
    const key = period === "month" ? `${date.getUTCFullYear()}-${date.getUTCMonth()}` : getWeekStart(date);
    const current = grouped.get(key);
    grouped.set(key, { date: current?.date ?? date, volume: (current?.volume ?? 0) + entry.volume, days: (current?.days ?? 0) + 1 });
  }

  return Array.from(grouped.values()).map(({ date, volume, days }) => ({
    name: period === "month"
      ? new Intl.DateTimeFormat("fr-CA", { month: "short", year: "numeric" }).format(date)
      : `Sem. ${new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" }).format(date)}`,
    volume: Math.round(volume / days)
  }));
}

function getWeekStart(date: Date) {
  const start = new Date(date);
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
  return start.toISOString().slice(0, 10);
}

function poolHeightLabel(height: PoolHeight) {
  switch (height) {
    case PoolHeight.ONE_METER:
      return "1 metre";
    case PoolHeight.THREE_METER:
      return "3 metres";
    case PoolHeight.PLATFORM:
      return "Plateforme";
    default:
      return "Autre";
  }
}
