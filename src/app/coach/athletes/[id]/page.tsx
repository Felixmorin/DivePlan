import { getAthleteHistory, type HistoryParams, type AthleteHistoryPage } from "@/lib/athlete-history";
import type { QueryResultRow } from "pg";
import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";
import { Dumbbell, Trophy, ChevronRight, CalendarDays, Activity, FileText, TrendingUp } from "lucide-react";
import { AthleteActionsMenu } from "@/app/coach/athletes/athlete-actions-menu";
import { CoachShell } from "@/components/coach/coach-shell";
import { CompetitionListPreview } from "@/components/coach/competition-list-preview";
import { CoachCompetitionListsTab } from "@/components/coach/coach-competition-lists-tab";
import { AthleteProfileTabs } from "@/components/coach/athlete-profile-tabs";
import { CoachCompetitionEvaluationForm } from "@/components/coach/coach-competition-evaluation-form";
import { CompetitionConfidenceChart, type CompetitionConfidencePoint } from "@/components/athlete/competition-confidence-chart";
import { ProgressChart } from "@/components/athlete/progress-chart";
import { CoachAthleteSessionHistory, type AthleteHistorySession } from "@/components/coach/coach-athlete-session-history";
import { AthleteFamilyDiveDetails } from "@/components/coach/athlete-family-dive-details";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { athletes as demoAthletes } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { avatarUrlForPage } from "@/lib/avatar";
import { resolveAvatarUrls } from "@/lib/avatar-storage";
import { getAthleteProgressTotals, type AthleteProgressTotals } from "@/lib/athlete-session";
import { countPoolContexts } from "@/lib/pool-list";
import { addMontrealDays, formatMontrealCountdown, formatMontrealDate, parseMontrealSessionDate, startOfMontrealDay } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type AthleteProfile = {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
  level: string;
  active: boolean;
  groupId?: string | null;
  groupName: string;
  birthDate?: Date | null;
  volume: number;
  nextSession?: { id: string; title: string; date: Date; status: string };
  recentSessions: Array<{ id: string; title: string; date: Date; status: string; rating?: string | null; note?: string | null; poolPlanned: number; poolActual: number; blocks: Array<{ id: string; title: string; planned: number; actual: number }> }>;
  sessionHistory: AthleteHistorySession[];
  skills: Array<{ code: string; name: string; status: string; progress: number; trainings: number; repetitions: number }>;
  nextCompetition?: { title: string; startsAt: Date; endsAt: Date | null };
  competitionLists: Array<{ id: string; name: string; position: number; heights: Array<"ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM"> }>;
  competitionDives: Array<{ id: string; listId: string; height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM"; platformHeight: number | null; code: string; name?: string; difficulty: number | null; volume: number; status: "READY" | "TO_WORK_ON" | "DIFFICULT" | "NOT_READY" }>;
  competitionConfidence: CompetitionConfidencePoint[];
  confidenceSchemaUnavailable: boolean;
  diveNotes: Array<{ id: string; code: string; name: string; height: string; note: string; updatedAt: Date; sessionId: string; sessionTitle: string; sessionDate: Date }>;
  progress: Pick<AthleteProgressTotals, "chartData" | "sessionChartData" | "weeklyChartData" | "monthlyChartData" | "skillData" | "skillDives">;
  attendance: { absent: number; total: number; rate: number };
};

type ProfileParams = HistoryParams & { tab?: string };
const read = <Row extends QueryResultRow>(enabled: boolean, sql: string, args: unknown[]) => enabled ? query<Row>(sql,args) : Promise.resolve({ rows: [] as Row[] });
export default async function AthleteDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ProfileParams> }) {
  const filters = await searchParams;
  const activeTab = ["evaluations", "competition", "history"].includes(filters.tab ?? "") ? filters.tab! : "overview";
  const overview = activeTab === "overview";
  const history = activeTab === "history";
  const competition = overview || activeTab === "competition" || activeTab === "evaluations";
  const [{ id }, { clubId }] = await Promise.all([params, requireCoach()]);

  if (clubId === "dev-club") {
    return <DemoAthleteDetailPage id={id} activeTab={activeTab} />;
  }

  const athlete=(await query<{id:string;userId:string;firstName:string;lastName:string;avatar:string|null;level:string;active:boolean;groupId:string|null;groupName:string|null;birthDate:Date|null}>(`SELECT a.id,a."userId",u."firstName",u."lastName",u.avatar,a.level,a.active,a."groupId",g.name AS "groupName",a."birthDate" FROM "Athlete" a JOIN "User" u ON u.id=a."userId" LEFT JOIN "TrainingGroup" g ON g.id=a."groupId" WHERE a.id=$1 AND a."clubId"=$2`,[id,clubId])).rows[0];
  if(!athlete) notFound();
  const groupOptions=(await query<{id:string;name:string}>(`SELECT id,name FROM "TrainingGroup" WHERE "clubId"=$1 ORDER BY name`,[clubId])).rows;
  // The overview only needs the latest seven ratings, never the entire history.
  const sessionHistoryRows = overview ? (await query<AthleteHistorySession>(`SELECT s.id,s.date,c.rating FROM "AthleteSessionCompletion" c JOIN "TrainingSession" s ON s.id=c."sessionId" JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE c."athleteId"=$1 AND w."clubId"=$2 AND lower(trim(c.rating)) IN ('pas bien','difficile','moyen','bien','très bien') ORDER BY s.date DESC,s.id DESC LIMIT 7`, [id,clubId])).rows : [];

  const [athleteAvatarUrl] = await resolveAvatarUrls([athlete.avatar]);
  const today=startOfMontrealDay();
  const seasonStartYear=today.getMonth()>=8?today.getFullYear():today.getFullYear()-1;
  const seasonStart=parseMontrealSessionDate(`${seasonStartYear}-09-01`,"00:00");
  const [completionRows,diveTotalResult,competitionListRows,competitionDiveRows,competitionDiveVolumeRows,attendanceRows,diveNoteRows,nextSessionRows,nextCompetitionRows]=await Promise.all([
    read<{sessionId:string;status:string;rating:string|null;note:string|null;title:string;date:Date}>(overview,`SELECT c."sessionId",c.status,c.rating,c.note,s.title,s.date FROM "AthleteSessionCompletion" c JOIN "TrainingSession" s ON s.id=c."sessionId" JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE c."athleteId"=$1 AND w."clubId"=$2 ORDER BY c."completedAt" DESC,c."startedAt" DESC LIMIT 8`,[athlete.id,clubId]),
    read<{volume:number}>(overview || history,`SELECT COALESCE(SUM(l."repetitionsCompleted"),0)::int AS volume FROM "AthleteDiveLog" l JOIN "TrainingSession" s ON s.id=l."sessionId" JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE l."athleteId"=$1 AND w."clubId"=$2`,[athlete.id,clubId]),
    read<{id:string;name:string;position:number;heights:Array<"ONE_METER"|"THREE_METER"|"PLATFORM"|"CUSTOM">}>(competition,`SELECT id,name,position,heights FROM "CompetitionDiveList" WHERE "athleteId"=$1 ORDER BY position,"createdAt"`,[athlete.id]),
    read<{id:string;listId:string;height:"ONE_METER"|"THREE_METER"|"PLATFORM"|"CUSTOM";platformHeight:number|null;diveCode:string;diveName:string;difficulty:number|null;status:"READY"|"TO_WORK_ON"|"DIFFICULT"|"NOT_READY"}>(competition,`SELECT id,"listId",height,"platformHeight","diveCode","diveName",difficulty,status FROM "CompetitionDive" WHERE "athleteId"=$1 ORDER BY height,position,"createdAt"`,[athlete.id]),
    read<{height:"ONE_METER"|"THREE_METER"|"PLATFORM"|"CUSTOM";heightLabel:string|null;diveCode:string;volume:number}>(overview || activeTab === "competition",`SELECT s.height,s.label AS "heightLabel",d."diveCode",SUM(l."repetitionsCompleted")::int AS volume FROM "AthleteDiveLog" l JOIN "PoolDive" d ON d.id=l."poolDiveId" JOIN "PoolSection" s ON s.id=d."poolSectionId" WHERE l."athleteId"=$1 GROUP BY s.height,s.label,d."diveCode"`,[athlete.id]),
    read<{id:string;date:Date}>(overview || history,`SELECT s.id,s.date FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE w."clubId"=$1 AND s.status<>'NOT_DONE' AND s.date >= $2 AND s.date < $3 AND EXISTS (SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id WHERE b."sessionId"=s.id AND a."athleteId"=$4)`,[clubId,seasonStart,addMontrealDays(today,1),athlete.id]),
    read<{poolDiveId:string;note:string;updatedAt:Date;diveCode:string;diveName:string;height:string;sessionId:string;sessionTitle:string;sessionDate:Date}>(overview,`SELECT n."poolDiveId",n.note,n."updatedAt",d."diveCode",d."diveName",s.height,t.id AS "sessionId",t.title AS "sessionTitle",t.date AS "sessionDate" FROM "AthleteDiveNote" n JOIN "PoolDive" d ON d.id=n."poolDiveId" JOIN "PoolSection" s ON s.id=d."poolSectionId" JOIN "PoolTraining" p ON p."blockId"=s."poolTrainingId" JOIN "SessionBlock" b ON b.id=p."blockId" JOIN "TrainingSession" t ON t.id=b."sessionId" JOIN "TrainingWeek" w ON w.id=t."weekId" WHERE n."athleteId"=$1 AND w."clubId"=$2 ORDER BY n."updatedAt" DESC LIMIT 50`,[athlete.id,clubId]),
    read<{id:string;title:string;date:Date;status:string}>(true,`SELECT s.id,s.title,s.date,s.status FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE w."clubId"=$1 AND s.status='READY' AND s.date >= $2 AND EXISTS (SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id WHERE b."sessionId"=s.id AND a."athleteId"=$3) ORDER BY s.date LIMIT 1`,[clubId,today,athlete.id]),
    read<{title:string;startsAt:Date;endsAt:Date|null}>(overview,`SELECT title,"startsAt","endsAt" FROM "PlanningEvent" WHERE "clubId"=$1 AND type='COMPETITION' AND "startsAt">=$2 AND ("athleteId"=$3 OR ($4::text IS NOT NULL AND "groupId"=$4) OR ("athleteId" IS NULL AND "groupId" IS NULL)) ORDER BY "startsAt" LIMIT 1`,[clubId,today,athlete.id,athlete.groupId])
  ]);
  const recentIds=completionRows.rows.map(row=>row.sessionId);
  const [diveRows,exerciseRows]=recentIds.length?await Promise.all([
    query<{sessionId:string;poolDiveId:string;repetitionsCompleted:number}>(`SELECT "sessionId","poolDiveId","repetitionsCompleted" FROM "AthleteDiveLog" WHERE "athleteId"=$1 AND "sessionId"=ANY($2::text[])`,[athlete.id,recentIds]),
    query<{sessionId:string;exerciseId:string;completed:boolean}>(`SELECT "sessionId","exerciseId",completed FROM "AthleteExerciseLog" WHERE "athleteId"=$1 AND "sessionId"=ANY($2::text[])`,[athlete.id,recentIds])
  ]):[{rows:[] as Array<{sessionId:string;poolDiveId:string;repetitionsCompleted:number}>},{rows:[] as Array<{sessionId:string;exerciseId:string;completed:boolean}>}];
  const blockRows=recentIds.length?await query<{id:string;sessionId:string;title:string;type:string}>(`SELECT b.id,b."sessionId",b.title,b.type FROM "SessionBlock" b WHERE b."sessionId"=ANY($1::text[]) AND EXISTS (SELECT 1 FROM "SessionBlockAssignment" a WHERE a."sessionBlockId"=b.id AND a."athleteId"=$2) ORDER BY b.position`,[recentIds,athlete.id]):{rows:[] as {id:string;sessionId:string;title:string;type:string}[]};
  const blockIds=blockRows.rows.map(row=>row.id);
  const [poolPlanRows,drylandPlanRows]=await Promise.all([
    read<{blockId:string;diveId:string;diveCode:string;repetitions:number;label:string|null;height:string}>(blockIds.length > 0,`SELECT b.id AS "blockId",d.id AS "diveId",d."diveCode",d.repetitions,s.label,s.height FROM "PoolDive" d JOIN "PoolSection" s ON s.id=d."poolSectionId" JOIN "PoolTraining" p ON p."blockId"=s."poolTrainingId" JOIN "SessionBlock" b ON b.id=p."blockId" WHERE b.id=ANY($1::text[]) ORDER BY s."order",d."order"`,[blockIds]),
    read<{blockId:string;exerciseId:string;sets:number|null;reps:number|null}>(blockIds.length > 0,`SELECT "blockId","exerciseId",sets,reps FROM "DrylandBlockExercise" WHERE "blockId"=ANY($1::text[]) ORDER BY "order"`,[blockIds])
  ]);
  let confidenceRows:Array<{competitionDiveId:string;diveCode:string;height:"ONE_METER"|"THREE_METER"|"PLATFORM"|"CUSTOM";rating:number;evaluator:"ATHLETE"|"COACH";evaluatedAt:Date}>=[];
  let confidenceSchemaUnavailable=false;
  try {
    if (competition) confidenceRows=(await query<{competitionDiveId:string;diveCode:string;height:"ONE_METER"|"THREE_METER"|"PLATFORM"|"CUSTOM";rating:number;evaluator:"ATHLETE"|"COACH";evaluatedAt:Date}>(`SELECT "competitionDiveId","diveCode",height,rating,evaluator,"evaluatedAt" FROM "AthleteCompetitionDiveEvaluation" WHERE "athleteId"=$1 ORDER BY "evaluatedAt"`,[athlete.id])).rows;
  } catch(error) {
    const code=(error as {code?:string})?.code;
    if(code!=="42P01"&&code!=="42703")throw error;
    confidenceSchemaUnavailable=true;
    console.error("Competition dive evaluations are unavailable because the database migration has not been applied.",error);
  }
  const [progress,absenceRows]=await Promise.all([
    overview ? getAthleteProgressTotals(athlete.id, true) : Promise.resolve({chartData:[],sessionChartData:[],weeklyChartData:[],monthlyChartData:[],skillData:[],skillDives:[]}),
    attendanceRows.rows.length?query<{sessionId:string}>(`SELECT "sessionId" FROM "AthleteSessionAbsence" WHERE "athleteId"=$1 AND "sessionId"=ANY($2::text[])`,[athlete.id,attendanceRows.rows.map(s=>s.id)]):Promise.resolve({rows:[] as {sessionId:string}[]})
  ]);
  const recentSessions=completionRows.rows.map(completion=>{
    const blocks=blockRows.rows.filter(block=>block.sessionId===completion.sessionId).map(block=>{
      const pool=poolPlanRows.rows.filter(row=>row.blockId===block.id);
      const dryland=drylandPlanRows.rows.filter(row=>row.blockId===block.id);
      const planned=pool.reduce((sum,row)=>sum+row.repetitions*Math.max(1,countPoolContexts(row.label??row.height)),0)+dryland.reduce((sum,row)=>sum+(row.sets??1)*(row.reps??0),0);
      const actual=pool.reduce((sum,row)=>sum+(diveRows.rows.find(log=>log.sessionId===completion.sessionId&&log.poolDiveId===row.diveId)?.repetitionsCompleted??0),0)+dryland.reduce((sum,row)=>sum+(exerciseRows.rows.find(log=>log.sessionId===completion.sessionId&&log.exerciseId===row.exerciseId)?.completed?(row.sets??1)*(row.reps??0):0),0);
      return {id:block.id,title:block.title,planned,actual};
    });
    const poolPlanned=poolPlanRows.rows.filter(row=>blockRows.rows.some(block=>block.sessionId===completion.sessionId&&block.id===row.blockId)).reduce((sum,row)=>sum+row.repetitions*Math.max(1,countPoolContexts(row.label??row.height)),0);
    const poolActual=diveRows.rows.filter(log=>log.sessionId===completion.sessionId).reduce((sum,log)=>sum+log.repetitionsCompleted,0);
    return {id:completion.sessionId,title:completion.title,date:completion.date,status:completion.status,rating:completion.rating,note:completion.note,poolPlanned,poolActual,blocks};
  });
  const profile: AthleteProfile = {
    id:athlete.id,firstName:athlete.firstName,lastName:athlete.lastName,avatar:athleteAvatarUrl ?? avatarUrlForPage(athlete.avatar),level:athlete.level,active:athlete.active,groupId:athlete.groupId,groupName:athlete.groupName??"Sans groupe",birthDate:athlete.birthDate,
    volume:diveTotalResult.rows[0]?.volume??0,sessionHistory:sessionHistoryRows,
    nextSession:nextSessionRows.rows[0],recentSessions,
    skills:[],
    nextCompetition:nextCompetitionRows.rows[0],
    competitionLists:competitionListRows.rows,
    competitionDives:competitionDiveRows.rows.map(row=>({id:row.id,listId:row.listId,height:row.height,platformHeight:row.platformHeight,code:row.diveCode,name:row.diveName,difficulty:row.difficulty,status:row.status,volume:competitionDiveVolumeRows.rows.filter(volume=>volume.diveCode===row.diveCode&&matchesCompetitionDiveHeight(volume.height,volume.heightLabel,row.height,row.platformHeight)).reduce((sum,volume)=>sum+volume.volume,0)})),
    competitionConfidence:confidenceRows.map(row=>({competitionDiveId:row.competitionDiveId,code:row.diveCode,height:row.height,rating:row.rating,evaluator:row.evaluator,evaluatedAt:row.evaluatedAt.toISOString()})),confidenceSchemaUnavailable,
    diveNotes:diveNoteRows.rows.map(row=>({id:row.poolDiveId,code:row.diveCode,name:row.diveName,height:row.height,note:row.note,updatedAt:row.updatedAt,sessionId:row.sessionId,sessionTitle:row.sessionTitle,sessionDate:row.sessionDate})),progress,
    attendance:{absent:absenceRows.rows.length,total:attendanceRows.rows.length,rate:attendanceRows.rows.length?Math.round(absenceRows.rows.length/attendanceRows.rows.length*100):0}
  };
  const historyPage = history ? await getAthleteHistory(id,clubId,filters,seasonStart) : undefined;
  return <AthleteDetail profile={profile} groups={groupOptions} activeTab={activeTab} historyPage={historyPage} />;
}

function DemoAthleteDetailPage({ id, activeTab }: { id: string; activeTab: string }) {
  const athlete = demoAthletes.find((item) => item.id === id);
  if (!athlete) {
    notFound();
  }

  return (
    <AthleteDetail
      profile={{
        id: athlete.id,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        avatar: avatarUrlForPage(athlete.avatar),
        level: athlete.level,
        active: athlete.status !== "surveiller",
        groupName: "Provincial",
        birthDate: parseMontrealSessionDate("2010-04-12"),
        volume: athlete.recentVolume,
        nextSession: { id: "demo", title: athlete.lastSession, date: parseMontrealSessionDate("2026-08-25"), status: "READY" },
        recentSessions: [
          { id: "demo", title: athlete.lastSession, date: parseMontrealSessionDate("2026-08-25"), status: "COMPLETED", rating: "Stable", note: "Placeholder demo.", poolPlanned: 12, poolActual: athlete.recentVolume, blocks: [{ id: "demo-block", title: "Bassin · technique", planned: 12, actual: athlete.recentVolume }] },
          { id: "demo-2", title: "Dryland power", date: parseMontrealSessionDate("2026-08-22"), status: "COMPLETED", rating: "Bon effort", note: null, poolPlanned: 0, poolActual: 0, blocks: [{ id: "demo-block-2", title: "Préparation physique", planned: 72, actual: 60 }] }
        ],
        sessionHistory: [
          { id: "demo", title: athlete.lastSession, date: parseMontrealSessionDate("2026-08-25"), type: "Technique", duration: 90, status: "COMPLETED", volume: athlete.recentVolume, coachNote: "Très bonne qualité sur les plongeons. Continuer à travailler la stabilité.", rating: "Très bien" },
          { id: "demo-2", title: "Dryland power", date: parseMontrealSessionDate("2026-08-22"), type: "Physique", duration: 75, status: "COMPLETED", volume: 0, coachNote: "Bon engagement et bonne régularité.", rating: "Bien" }
        ],
        skills: [
          { code: "201B", name: "Arriere carpe", status: "DEVELOPING", progress: 68, trainings: 8, repetitions: 31 },
          { code: "301C", name: "Retour groupe", status: "LEARNING", progress: 44, trainings: 5, repetitions: 18 },
          { code: "101C", name: "Avant groupe", status: "MASTERED", progress: 92, trainings: 16, repetitions: 70 }
        ],
        competitionLists: [{ id: "demo-list", name: "Liste de compétition", position: 0, heights: ["ONE_METER", "THREE_METER"] }],
        competitionDives: [
          { id: "competition-1", listId: "demo-list", height: "ONE_METER", platformHeight: null, code: "203C", difficulty: 2, volume: 0, status: "NOT_READY" },
          { id: "competition-2", listId: "demo-list", height: "ONE_METER", platformHeight: null, code: "201B", difficulty: 1.6, volume: 0, status: "NOT_READY" },
          { id: "competition-3", listId: "demo-list", height: "THREE_METER", platformHeight: null, code: "405C", difficulty: 3.1, volume: 0, status: "NOT_READY" }
        ],
        competitionConfidence: [],
        confidenceSchemaUnavailable: false,
        diveNotes: [],
        progress: {
          chartData: [
            { name: "18 août", volume: 22 },
            { name: "20 août", volume: 31 },
            { name: "22 août", volume: 27 },
            { name: "25 août", volume: 36 }
          ],
          sessionChartData: [
            { name: "18 août", volume: 22, finalRating: "Bien" },
            { name: "20 août", volume: 31, finalRating: "Très bien" },
            { name: "22 août", volume: 27, finalRating: "Moyen" },
            { name: "25 août", volume: 36, finalRating: "Bien" }
          ],
          weeklyChartData: [{ name: "Sem. 18 août", volume: 29 }],
          monthlyChartData: [{ name: "août 2026", volume: 29 }],
          skillData: [
            { name: "Avant", volume: 31 },
            { name: "Arriere", volume: 18 },
            { name: "Renverse", volume: 12 },
            { name: "Retourne", volume: 8 },
            { name: "Vrille", volume: 0 },
            { name: "Equilibre", volume: 0 }
          ],
          skillDives: [
            { category: "Arriere", code: "201B", name: "Arriere carpe", height: "ONE_METER", heightLabel: null, volume: 18 },
            { category: "Renverse", code: "301C", name: "Retour groupe", height: "THREE_METER", heightLabel: null, volume: 12 },
            { category: "Avant", code: "101C", name: "Avant groupe", height: "ONE_METER", heightLabel: null, volume: 31 }
          ]
        },
        attendance: { absent: 1, total: 8, rate: 13 }
      }}
      activeTab={activeTab}
      demo
    />
  );
}

function AthleteDetail({ profile, groups = [], demo = false, activeTab = "overview", historyPage }: { profile: AthleteProfile; groups?: Array<{id:string;name:string}>; demo?: boolean; activeTab?: string; historyPage?: AthleteHistoryPage }) {
  const fullName = `${profile.firstName} ${profile.lastName}`;
  const nextCompetition = profile.nextCompetition;
  const activeList = profile.competitionLists[0];
  const activeListDives = activeList ? profile.competitionDives.filter((dive)=>dive.listId===activeList.id).map((dive)=>({...dive,repetitions:dive.volume,athleteEvaluation:profile.competitionConfidence.filter((item)=>item.competitionDiveId===dive.id&&item.evaluator==="ATHLETE").sort((a,b)=>b.evaluatedAt.localeCompare(a.evaluatedAt))[0]?.rating??null,note:profile.diveNotes.find((note)=>note.code===dive.code)?.note??null})) : [];
  const divesWithTenReps = activeListDives.filter((dive) => dive.volume >= 10).length;
  const sessionRatingScale = ["pas bien", "difficile", "moyen", "bien", "très bien"];
  const wellnessPoints = profile.sessionHistory
    .filter((session) => session.rating && sessionRatingScale.includes(session.rating.trim().toLocaleLowerCase("fr")))
    .map((session) => ({ ...session, score: sessionRatingScale.indexOf(session.rating!.trim().toLocaleLowerCase("fr")) + 1 }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-7);
  const wellnessAverage = wellnessPoints.length ? wellnessPoints.reduce((sum, point) => sum + point.score, 0) / wellnessPoints.length : null;
  const wellnessCoordinates = wellnessPoints.map((point, index) => `${wellnessPoints.length < 2 ? 54 : 12 + index / (wellnessPoints.length - 1) * 86},${47 - (point.score - 1) * 10}`);
  const wellnessLine = wellnessCoordinates.join(" ");
  const trendToday = startOfMontrealDay();
  const volumeTrend = Array.from({ length: 5 }, (_, index) => {
    const weekStart = addMontrealDays(trendToday, -28 + index * 7);
    const weekEnd = index === 4 ? addMontrealDays(trendToday, 1) : addMontrealDays(weekStart, 7);
    const sessions = profile.recentSessions.filter((session) => {
      const date = new Date(session.date);
      return date >= weekStart && date < weekEnd;
    });
    return {
      date: weekStart,
      planned: sessions.reduce((sum, session) => sum + session.poolPlanned, 0),
      actual: sessions.reduce((sum, session) => sum + session.poolActual, 0)
    };
  });
  const trendMax = Math.max(20, Math.ceil(Math.max(...volumeTrend.map((point) => point.planned), ...volumeTrend.map((point) => point.actual)) / 20) * 20);
  const trendY = (value: number) => 43 - (value / trendMax) * 34;
  const plannedTrendPoints = volumeTrend.map((point, index) => `${12 + index * 19},${trendY(point.planned)}`).join(" ");
  const actualTrendPoints = volumeTrend.map((point, index) => `${12 + index * 19},${trendY(point.actual)}`).join(" ");
  const evaluations = profile.competitionConfidence;
  const evaluationDates = new Set(evaluations.map((item)=>item.evaluatedAt));
  const athleteRatings = evaluations.filter((item)=>item.evaluator==="ATHLETE").map((item)=>item.rating);
  const athleteAverage = athleteRatings.length ? athleteRatings.reduce((sum,rating)=>sum+rating,0)/athleteRatings.length : null;
  const evaluationHeightLabels = { ONE_METER: "1 m", THREE_METER: "3 m", PLATFORM: "Plateforme", CUSTOM: "Autre" } as const;
  const athleteRatingsByHeight = (["ONE_METER", "THREE_METER", "PLATFORM", "CUSTOM"] as const).map((height) => {
    const ratings = evaluations.filter((item) => item.evaluator === "ATHLETE" && item.height === height).map((item) => item.rating);
    return { height, label: evaluationHeightLabels[height], ratings, average: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null };
  }).filter((item) => item.ratings.length > 0);
  const latestEvaluation = evaluations.length ? [...evaluations].sort((a,b)=>b.evaluatedAt.localeCompare(a.evaluatedAt))[0] : null;
  const overview = <div className="athlete-dashboard-grid" id="overview">
    <main className="athlete-dashboard-main">
      <div className="athlete-stats">
        <div className="athlete-stat-card"><span className="athlete-icon-box"><Dumbbell className="h-4 w-4"/></span><div><small>Séances complétées</small><b>{profile.attendance.total-profile.attendance.absent} <i>/ {profile.attendance.total}</i></b><em>{profile.attendance.total ? `${Math.max(0,100-profile.attendance.rate)}% présence` : "cette saison"}</em></div><span className="athlete-stat-accent">{profile.attendance.total?`${Math.max(0,100-profile.attendance.rate)}%`:"—"}</span></div>
        <div className="athlete-stat-card"><span className="athlete-icon-box"><Activity className="h-4 w-4"/></span><div><small>Volume d’entraînement</small><b>{profile.volume}</b><em>plongeons enregistrés</em></div><span className="athlete-stat-accent">↗</span></div>
        <div className="athlete-stat-card"><span className="athlete-icon-box athlete-trophy"><Trophy className="h-4 w-4"/></span><div><small>Prochaine compétition</small><b>{nextCompetition ? formatMontrealCountdown(nextCompetition.startsAt) : "À planifier"}</b><em>{nextCompetition?.title ?? "Aucune compétition"}</em></div><ChevronRight className="ml-auto h-4 w-4"/></div>
      </div>
      <div className="athlete-top-panels">
        <section className="athlete-panel"><h2>Prochaine séance</h2>{profile.nextSession?<Link className="athlete-feature-link" href={demo?"/coach/sessions/demo":`/coach/sessions/${profile.nextSession.id}`}><CalendarDays className="h-5 w-5"/><span><b>{formatMontrealDate(profile.nextSession.date,{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</b><small>{profile.nextSession.title}</small></span><ChevronRight className="ml-auto h-4 w-4"/></Link>:<p className="athlete-empty">Aucune séance planifiée.</p>}</section>
        <section className="athlete-panel"><h2>État actuel</h2><div className="athlete-state-grid"><div><span>Plongeons à 10 reps ou +</span><b>{divesWithTenReps} / {activeListDives.length}</b><i>{activeList?.name ?? "Aucune liste active"}</i></div><div><span>Assiduité</span><b>{profile.attendance.total?`${Math.max(0,100-profile.attendance.rate)}%`:"—"}</b><i>présence saison</i></div></div></section>
      </div>
      <section className="athlete-panel">{profile.progress.skillData.length>0?<AthleteFamilyDiveDetails athleteId={profile.id} dives={profile.progress.skillDives} totals={profile.progress.skillData}/>:<><h2>Charge d’entraînement par famille de plongeon</h2><p className="athlete-empty">Aucune donnée de volume par famille.</p></>}</section>
      <div id="competition-list"><CompetitionListPreview name={activeList?.name??"Liste de compétition"} dives={activeListDives}/></div>
      <section className="athlete-panel athlete-volume-trend-panel"><h2>Évolution du volume</h2><p>Volume et ressenti à la fin de chaque séance.</p><div className="coach-athlete-progress"><ProgressChart data={profile.progress.chartData} sessionData={profile.progress.sessionChartData} weeklyData={profile.progress.weeklyChartData} monthlyData={profile.progress.monthlyChartData} initialPeriod="session-rating" lightTheme barColor="#ed163d"/></div></section>
    </main>
    <aside className="athlete-dashboard-side">
      <section className="athlete-panel"><div className="athlete-panel-title"><h2>Prochaine compétition</h2>{nextCompetition&&<ChevronRight className="h-4 w-4"/>}</div>{nextCompetition?<div className="athlete-event-card"><div className="athlete-event-art"><Trophy className="h-7 w-7"/></div><div><b>{nextCompetition.title}</b><small>{formatMontrealDate(nextCompetition.startsAt,{day:"numeric",month:"short",year:"numeric"})}</small>{nextCompetition.endsAt&&<small>Au {formatMontrealDate(nextCompetition.endsAt)}</small>}</div><span className="athlete-countdown"><small>Dans</small><b>{formatMontrealCountdown(nextCompetition.startsAt)}</b></span></div>:<p className="athlete-empty">Aucune compétition prévue.</p>}</section>
      <section className="athlete-panel athlete-session-rating-panel"><h2>Tendances bien-être</h2><div className="athlete-wellbeing"><strong>{wellnessAverage === null ? "—" : wellnessAverage.toFixed(1)}</strong><span>/ 5</span><i aria-hidden="true">⌄</i><p>Ressenti moyen après séance</p></div>{wellnessPoints.length ? <div className="athlete-session-rating-chart"><svg viewBox="0 0 100 56" preserveAspectRatio="none" role="img" aria-label={`Évaluations de fin de séance, moyenne ${wellnessAverage?.toFixed(1)} sur 5`}>
        {[1,2,3,4,5].map((score) => { const y = 47 - (score - 1) * 10; return <g key={score}><line x1="10" x2="99" y1={y} y2={y} stroke="#e7edf3" strokeWidth=".5" vectorEffect="non-scaling-stroke"/><text x="1" y={y + 1.5} fill="#71839a" fontSize="4">{score}</text></g>; })}
        {wellnessPoints.length > 1 && <polygon points={`10,49 ${wellnessLine} 99,49`} fill="url(#session-rating-fill)"/>}
        <defs><linearGradient id="session-rating-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#17b8c9" stopOpacity=".2"/><stop offset="100%" stopColor="#17b8c9" stopOpacity="0"/></linearGradient></defs>
        <polyline points={wellnessLine} fill="none" stroke="#0aa9ba" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
        {wellnessPoints.map((point,index) => <circle key={point.id} cx={wellnessPoints.length < 2 ? 54 : 12 + index / (wellnessPoints.length - 1) * 86} cy={47 - (point.score - 1) * 10} r="2" fill="#fff" stroke="#0aa9ba" strokeWidth="1.5" vectorEffect="non-scaling-stroke"><title>{`${formatMontrealDate(new Date(point.date),{day:"numeric",month:"short"})} · ${point.rating}`}</title></circle>)}
      </svg><div className="athlete-session-rating-dates"><span>{formatMontrealDate(new Date(wellnessPoints[0].date),{day:"numeric",month:"short"})}</span><span>{formatMontrealDate(new Date(wellnessPoints[Math.floor((wellnessPoints.length-1)/2)].date),{day:"numeric",month:"short"})}</span><span>{formatMontrealDate(new Date(wellnessPoints.at(-1)!.date),{day:"numeric",month:"short"})}</span></div><div className="athlete-session-rating-legend"><span><i/>Pas bien</span><span><i/>Difficile</span><span><i/>Moyen</span><span><i/>Bien</span><span><i/>Très bien</span></div></div> : <p className="athlete-empty athlete-session-rating-empty">Aucune évaluation de fin de séance pour le moment.</p>}</section>
      <section className="athlete-panel" id="athlete-notes"><div className="athlete-panel-title"><h2>Derniers commentaires de l’athlète</h2></div>{profile.diveNotes.slice(0,3).map(note=><div className="athlete-note-row" key={note.id}><span className="athlete-icon-box"><FileText className="h-4 w-4"/></span><div><b>{formatMontrealDate(note.sessionDate,{day:"numeric",month:"short"})} · {note.code} · {note.height === "ONE_METER" ? "1 m" : note.height === "THREE_METER" ? "3 m" : note.height === "PLATFORM" ? "Plateforme" : note.height.replaceAll("_", " ")}</b><p>{note.note}</p></div><ChevronRight className="h-4 w-4 shrink-0"/></div>)}{profile.diveNotes.length===0&&<p className="athlete-empty">Aucun commentaire pour le moment.</p>}</section>
      <section className="athlete-panel"><div className="athlete-panel-title"><h2>Séances récentes</h2></div><div className="athlete-session-list">{profile.recentSessions.slice(0,6).map(session=><Link key={session.id} href={demo?"/coach/sessions/demo":`/coach/sessions/${session.id}`}><span>{formatMontrealDate(session.date,{day:"numeric",month:"short"})}</span><b>{session.title}</b><em>{session.poolActual} reps</em><ChevronRight className="h-3.5 w-3.5"/></Link>)}{profile.recentSessions.length===0&&<p className="athlete-empty">Aucune séance terminée.</p>}</div></section>
      <section className="athlete-panel athlete-volume-weekly-panel"><header className="athlete-volume-weekly-heading"><div><h2><TrendingUp className="h-4 w-4"/> Tendances</h2><p>4 dernières semaines</p></div><span>Volume total <ChevronRight className="h-3 w-3"/></span></header>
        <div className="athlete-volume-weekly-chart"><svg viewBox="0 0 100 57" preserveAspectRatio="none" role="img" aria-label="Tendances du volume prévu et réalisé sur les quatre dernières semaines">
          {[0,1,2,3].map((step) => { const value = Math.round((trendMax / 3) * (3 - step)); const y = 43 - (value / trendMax) * 34; return <g key={step}><line x1="10" x2="96" y1={y} y2={y} stroke="#e7edf3" strokeWidth=".45" vectorEffect="non-scaling-stroke"/><text x="1" y={y + 1.4} fill="#71839a" fontSize="3.8">{value}</text></g>; })}
          <polyline points={plannedTrendPoints} fill="none" stroke="#aabbd1" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
          <polyline points={actualTrendPoints} fill="none" stroke="#09b7eb" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
          {volumeTrend.map((point,index)=><g key={point.date.toISOString()}><circle cx={12+index*19} cy={trendY(point.planned)} r="1.7" fill="#aabbd1" stroke="white" strokeWidth=".7" vectorEffect="non-scaling-stroke"><title>{`Prévu : ${point.planned}`}</title></circle><circle cx={12+index*19} cy={trendY(point.actual)} r="1.7" fill="#09b7eb" stroke="white" strokeWidth=".7" vectorEffect="non-scaling-stroke"><title>{`Réalisé : ${point.actual}`}</title></circle><text x={12+index*19} y="52" textAnchor="middle" fill="#536a83" fontSize="3.6">{formatMontrealDate(point.date,{day:"numeric",month:"short"})}</text></g>)}
        </svg></div><div className="athlete-volume-weekly-legend"><span><i className="is-planned"/>Prévu</span><span><i className="is-actual"/>Réalisé</span></div>
      </section>
    </aside>
  </div>;
  const evaluationsTab = <div className="athlete-evaluations-page">
    <section className="athlete-panel">
      <h2>Overall</h2>
      <div className="athlete-evaluation-stats">
        <div><small>Ressenti moyen global</small><b>{athleteAverage===null?"—":`${athleteAverage.toFixed(1)} / 5`}</b><span>{athleteRatings.length} notes de confiance, toutes épreuves confondues</span></div>
      </div>
    </section>
    <section className="athlete-panel">
      <h2>Moyenne par épreuve</h2>
      <div className="athlete-evaluation-stats">
        {athleteRatingsByHeight.map((item) => <div key={item.height}><small>{item.label}</small><b>{item.average!.toFixed(1)} / 5</b><span>{item.ratings.length} {item.ratings.length === 1 ? "note" : "notes"} de confiance</span></div>)}
        {athleteRatingsByHeight.length === 0 && <div><small>Aucune épreuve évaluée</small><b>—</b><span>Les moyennes apparaîtront après les évaluations.</span></div>}
      </div>
    </section>
    <section className="athlete-panel">
      <h2>Suivi des évaluations</h2>
      <div className="athlete-evaluation-stats">
      <div><small>Évaluations enregistrées</small><b>{evaluationDates.size}</b><span>depuis le début du suivi</span></div>
      <div><small>Dernière évaluation</small><b>{latestEvaluation?formatMontrealDate(new Date(latestEvaluation.evaluatedAt),{day:"numeric",month:"short",year:"numeric"}):"Aucune"}</b><span>{latestEvaluation?`${latestEvaluation.evaluator==="COACH"?"Coach":"Athlète"} · ${latestEvaluation.code}`:"Aucune évaluation enregistrée"}</span></div>
      </div>
    </section>
    <CompetitionConfidenceChart data={evaluations}/>
    {profile.confidenceSchemaUnavailable?<p className="athlete-warning">Les évaluations sont temporairement indisponibles. Une migration de la base de données est requise pour les consulter ou en saisir.</p>:<CoachCompetitionEvaluationForm athleteId={profile.id} dives={activeListDives.map(({id,code,height,platformHeight})=>({id,code,height,platformHeight}))}/>}
  </div>;
  const historyTab = <CoachAthleteSessionHistory sessions={historyPage?.sessions ?? profile.sessionHistory} pagination={historyPage} athleteId={profile.id} attendance={profile.attendance} totalVolume={profile.volume} demo={demo}/>;
  const competitionTab = <CoachCompetitionListsTab athleteId={profile.id} lists={profile.competitionLists} dives={profile.competitionDives.map((dive)=>({...dive,athleteEvaluation:profile.competitionConfidence.filter((item)=>item.competitionDiveId===dive.id&&item.evaluator==="ATHLETE").sort((a,b)=>b.evaluatedAt.localeCompare(a.evaluatedAt))[0]?.rating??null}))} demo={demo}/>;

  return <CoachShell active="Athletes">
    <div className="athlete-dashboard">
      <header className="athlete-profile-head">
        <div className="athlete-identity"><Avatar className="h-14 w-14 border-0 bg-cyan-100 text-cyan-700"><AvatarImage src={profile.avatar ?? undefined}/><AvatarFallback>{profile.firstName[0]}{profile.lastName[0]}</AvatarFallback></Avatar><div><h1>{fullName}</h1><p>Plongeon de compétition · {profile.groupName}{profile.birthDate ? ` · ${formatMontrealDate(profile.birthDate,{year:"numeric"})}` : ""}</p><div className="athlete-tags"><Badge variant="success">{profile.level}</Badge><Badge variant="outline">{profile.groupName}</Badge><Badge variant="outline">{profile.active ? "Actif" : "Inactif"}</Badge></div></div></div>
        <div className="athlete-head-actions">{profile.nextSession&&<Button asChild size="sm" variant="outline"><Link href={demo?"/coach/sessions/demo":`/coach/sessions/${profile.nextSession.id}`}><CalendarDays className="h-4 w-4"/> Prochaine séance</Link></Button>}<AthleteActionsMenu athlete={{id:profile.id,firstName:profile.firstName,lastName:profile.lastName,level:profile.level,groupId:profile.groupId??null,birthDate:profile.birthDate?formatMontrealDate(profile.birthDate,{year:"numeric",month:"2-digit",day:"2-digit"}).replace(/\//g,"-"):null,active:profile.active}} groups={groups} demo={demo} directEdit/></div>
      </header>
      <AthleteProfileTabs activeTab={activeTab} athleteId={profile.id}>{activeTab === "overview" ? overview : activeTab === "evaluations" ? evaluationsTab : activeTab === "competition" ? competitionTab : historyTab}</AthleteProfileTabs>
    </div>
  </CoachShell>;
}

function matchesCompetitionDiveHeight(
  volumeHeight: AthleteProfile["competitionDives"][number]["height"],
  volumeHeightLabel: string | null,
  competitionHeight: AthleteProfile["competitionDives"][number]["height"],
  platformHeight: number | null
) {
  if (competitionHeight !== "PLATFORM") return volumeHeight === competitionHeight;
  if (volumeHeight !== "PLATFORM" && volumeHeight !== "CUSTOM") return false;
  if (volumeHeight === "PLATFORM" && volumeHeightLabel === null) return true;
  if (platformHeight === null) return false;
  const label = (volumeHeightLabel ?? "").toLowerCase().replace(/,/g, ".");
  const matchedHeight = label.match(/(3|5|7\.5|10)\s*m(?:t)?/);
  return matchedHeight !== null && Number(matchedHeight[1]) === platformHeight;
}
