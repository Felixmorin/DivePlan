import Link from "next/link";
import { notFound } from "next/navigation";
import { Dumbbell, Trophy, ChevronRight, CalendarDays, Activity, FileText } from "lucide-react";
import { AthleteActionsMenu } from "@/app/coach/athletes/athlete-actions-menu";
import { CoachShell } from "@/components/coach/coach-shell";
import { CompetitionListPreview } from "@/components/coach/competition-list-preview";
import { AthleteProfileTabs } from "@/components/coach/athlete-profile-tabs";
import { CoachCompetitionEvaluationForm } from "@/components/coach/coach-competition-evaluation-form";
import { CompetitionConfidenceChart, type CompetitionConfidencePoint } from "@/components/athlete/competition-confidence-chart";
import { StatusPill } from "@/components/training/status-pill";
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

const diveFamilyColors: Record<string,string> = {
  Avant: "#08c9c7",
  Arriere: "#ff655c",
  Renverse: "#36a0ff",
  Retourne: "#9147ed",
  Vrille: "#08a9c5",
  Equilibre: "#edb52b"
};

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
  skills: Array<{ code: string; name: string; status: string; progress: number; trainings: number; repetitions: number }>;
  nextCompetition?: { title: string; startsAt: Date; endsAt: Date | null };
  competitionLists: Array<{ id: string; name: string }>;
  competitionDives: Array<{ id: string; listId: string; height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM"; platformHeight: number | null; code: string; difficulty: number | null; volume: number }>;
  competitionConfidence: CompetitionConfidencePoint[];
  confidenceSchemaUnavailable: boolean;
  diveNotes: Array<{ id: string; code: string; name: string; height: string; note: string; updatedAt: Date; sessionId: string; sessionTitle: string; sessionDate: Date }>;
  progress: Pick<AthleteProgressTotals, "chartData" | "sessionChartData" | "weeklyChartData" | "monthlyChartData" | "skillData" | "skillDives">;
  attendance: { absent: number; total: number; rate: number };
};

export default async function AthleteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { clubId }] = await Promise.all([params, requireCoach()]);

  if (clubId === "dev-club") {
    return <DemoAthleteDetailPage id={id} />;
  }

  const athlete=(await query<{id:string;userId:string;firstName:string;lastName:string;avatar:string|null;level:string;active:boolean;groupId:string|null;groupName:string|null;birthDate:Date|null}>(`SELECT a.id,a."userId",u."firstName",u."lastName",u.avatar,a.level,a.active,a."groupId",g.name AS "groupName",a."birthDate" FROM "Athlete" a JOIN "User" u ON u.id=a."userId" LEFT JOIN "TrainingGroup" g ON g.id=a."groupId" WHERE a.id=$1 AND a."clubId"=$2`,[id,clubId])).rows[0];
  if(!athlete) notFound();
  const groupOptions=(await query<{id:string;name:string}>(`SELECT id,name FROM "TrainingGroup" WHERE "clubId"=$1 ORDER BY name`,[clubId])).rows;
  const [athleteAvatarUrl] = await resolveAvatarUrls([athlete.avatar]);
  const today=startOfMontrealDay();
  const seasonStartYear=today.getMonth()>=8?today.getFullYear():today.getFullYear()-1;
  const seasonStart=parseMontrealSessionDate(`${seasonStartYear}-09-01`,"00:00");
  const [completionRows,diveTotalResult,skillsRows,competitionListRows,competitionDiveRows,competitionDiveVolumeRows,attendanceRows,diveNoteRows,nextSessionRows,nextCompetitionRows]=await Promise.all([
    query<{sessionId:string;status:string;rating:string|null;note:string|null;title:string;date:Date}>(`SELECT c."sessionId",c.status,c.rating,c.note,s.title,s.date FROM "AthleteSessionCompletion" c JOIN "TrainingSession" s ON s.id=c."sessionId" JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE c."athleteId"=$1 AND w."clubId"=$2 ORDER BY c."completedAt" DESC,c."startedAt" DESC LIMIT 8`,[athlete.id,clubId]),
    query<{volume:number}>(`SELECT COALESCE(SUM(l."repetitionsCompleted"),0)::int AS volume FROM "AthleteDiveLog" l JOIN "TrainingSession" s ON s.id=l."sessionId" JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE l."athleteId"=$1 AND w."clubId"=$2`,[athlete.id,clubId]),
    query<{code:string;name:string;status:string;progress:number;trainings:number;repetitions:number}>(`SELECT s.code,s.name,a.status,a.progress,a.trainings,a.repetitions FROM "AthleteSkill" a JOIN "Skill" s ON s.id=a."skillId" WHERE a."athleteId"=$1 ORDER BY a.progress DESC`,[athlete.id]),
    query<{id:string;name:string}>(`SELECT id,name FROM "CompetitionDiveList" WHERE "athleteId"=$1 ORDER BY position,"createdAt"`,[athlete.id]),
    query<{id:string;listId:string;height:"ONE_METER"|"THREE_METER"|"PLATFORM"|"CUSTOM";platformHeight:number|null;diveCode:string;difficulty:number|null}>(`SELECT id,"listId",height,"platformHeight","diveCode",difficulty FROM "CompetitionDive" WHERE "athleteId"=$1 ORDER BY height,position,"createdAt"`,[athlete.id]),
    query<{height:"ONE_METER"|"THREE_METER"|"PLATFORM"|"CUSTOM";heightLabel:string|null;diveCode:string;volume:number}>(`SELECT s.height,s.label AS "heightLabel",d."diveCode",SUM(l."repetitionsCompleted")::int AS volume FROM "AthleteDiveLog" l JOIN "PoolDive" d ON d.id=l."poolDiveId" JOIN "PoolSection" s ON s.id=d."poolSectionId" WHERE l."athleteId"=$1 GROUP BY s.height,s.label,d."diveCode"`,[athlete.id]),
    query<{id:string;date:Date}>(`SELECT s.id,s.date FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE w."clubId"=$1 AND s.status<>'NOT_DONE' AND s.date >= $2 AND s.date < $3 AND EXISTS (SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id WHERE b."sessionId"=s.id AND a."athleteId"=$4)`,[clubId,seasonStart,addMontrealDays(today,1),athlete.id]),
    query<{poolDiveId:string;note:string;updatedAt:Date;diveCode:string;diveName:string;height:string;sessionId:string;sessionTitle:string;sessionDate:Date}>(`SELECT n."poolDiveId",n.note,n."updatedAt",d."diveCode",d."diveName",s.height,t.id AS "sessionId",t.title AS "sessionTitle",t.date AS "sessionDate" FROM "AthleteDiveNote" n JOIN "PoolDive" d ON d.id=n."poolDiveId" JOIN "PoolSection" s ON s.id=d."poolSectionId" JOIN "PoolTraining" p ON p."blockId"=s."poolTrainingId" JOIN "SessionBlock" b ON b.id=p."blockId" JOIN "TrainingSession" t ON t.id=b."sessionId" JOIN "TrainingWeek" w ON w.id=t."weekId" WHERE n."athleteId"=$1 AND w."clubId"=$2 ORDER BY n."updatedAt" DESC LIMIT 50`,[athlete.id,clubId]),
    query<{id:string;title:string;date:Date;status:string}>(`SELECT s.id,s.title,s.date,s.status FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE w."clubId"=$1 AND s.status='READY' AND s.date >= $2 AND EXISTS (SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id WHERE b."sessionId"=s.id AND a."athleteId"=$3) ORDER BY s.date LIMIT 1`,[clubId,today,athlete.id]),
    query<{title:string;startsAt:Date;endsAt:Date|null}>(`SELECT title,"startsAt","endsAt" FROM "PlanningEvent" WHERE "clubId"=$1 AND type='COMPETITION' AND "startsAt">=$2 AND ("athleteId"=$3 OR ($4::text IS NOT NULL AND "groupId"=$4) OR ("athleteId" IS NULL AND "groupId" IS NULL)) ORDER BY "startsAt" LIMIT 1`,[clubId,today,athlete.id,athlete.groupId])
  ]);
  const recentIds=completionRows.rows.map(row=>row.sessionId);
  const [diveRows,exerciseRows]=recentIds.length?await Promise.all([
    query<{sessionId:string;poolDiveId:string;repetitionsCompleted:number}>(`SELECT "sessionId","poolDiveId","repetitionsCompleted" FROM "AthleteDiveLog" WHERE "athleteId"=$1 AND "sessionId"=ANY($2::text[])`,[athlete.id,recentIds]),
    query<{sessionId:string;exerciseId:string;completed:boolean}>(`SELECT "sessionId","exerciseId",completed FROM "AthleteExerciseLog" WHERE "athleteId"=$1 AND "sessionId"=ANY($2::text[])`,[athlete.id,recentIds])
  ]):[{rows:[] as Array<{sessionId:string;poolDiveId:string;repetitionsCompleted:number}>},{rows:[] as Array<{sessionId:string;exerciseId:string;completed:boolean}>}];
  const blockRows=recentIds.length?await query<{id:string;sessionId:string;title:string;type:string}>(`SELECT b.id,b."sessionId",b.title,b.type FROM "SessionBlock" b WHERE b."sessionId"=ANY($1::text[]) AND EXISTS (SELECT 1 FROM "SessionBlockAssignment" a WHERE a."sessionBlockId"=b.id AND a."athleteId"=$2) ORDER BY b.position`,[recentIds,athlete.id]):{rows:[] as {id:string;sessionId:string;title:string;type:string}[]};
  const blockIds=blockRows.rows.map(row=>row.id);
  const [poolPlanRows,drylandPlanRows]=await Promise.all([
    query<{blockId:string;diveId:string;diveCode:string;repetitions:number;label:string|null;height:string}>(`SELECT b.id AS "blockId",d.id AS "diveId",d."diveCode",d.repetitions,s.label,s.height FROM "PoolDive" d JOIN "PoolSection" s ON s.id=d."poolSectionId" JOIN "PoolTraining" p ON p."blockId"=s."poolTrainingId" JOIN "SessionBlock" b ON b.id=p."blockId" WHERE b.id=ANY($1::text[]) ORDER BY s."order",d."order"`,[blockIds]),
    query<{blockId:string;exerciseId:string;sets:number|null;reps:number|null}>(`SELECT "blockId","exerciseId",sets,reps FROM "DrylandBlockExercise" WHERE "blockId"=ANY($1::text[]) ORDER BY "order"`,[blockIds])
  ]);
  let confidenceRows:Array<{competitionDiveId:string;diveCode:string;height:"ONE_METER"|"THREE_METER"|"PLATFORM"|"CUSTOM";rating:number;evaluator:"ATHLETE"|"COACH";evaluatedAt:Date}>=[];
  let confidenceSchemaUnavailable=false;
  try {
    confidenceRows=(await query<{competitionDiveId:string;diveCode:string;height:"ONE_METER"|"THREE_METER"|"PLATFORM"|"CUSTOM";rating:number;evaluator:"ATHLETE"|"COACH";evaluatedAt:Date}>(`SELECT "competitionDiveId","diveCode",height,rating,evaluator,"evaluatedAt" FROM "AthleteCompetitionDiveEvaluation" WHERE "athleteId"=$1 ORDER BY "evaluatedAt"`,[athlete.id])).rows;
  } catch(error) {
    const code=(error as {code?:string})?.code;
    if(code!=="42P01"&&code!=="42703")throw error;
    confidenceSchemaUnavailable=true;
    console.error("Competition dive evaluations are unavailable because the database migration has not been applied.",error);
  }
  const [progress,absenceRows]=await Promise.all([
    getAthleteProgressTotals(athlete.id),
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
    volume:diveTotalResult.rows[0]?.volume??0,
    nextSession:nextSessionRows.rows[0],recentSessions,
    skills:skillsRows.rows.map(row=>({code:row.code,name:row.name,status:row.status,progress:row.progress,trainings:row.trainings,repetitions:row.repetitions})),
    nextCompetition:nextCompetitionRows.rows[0],
    competitionLists:competitionListRows.rows,
    competitionDives:competitionDiveRows.rows.map(row=>({id:row.id,listId:row.listId,height:row.height,platformHeight:row.platformHeight,code:row.diveCode,difficulty:row.difficulty,volume:competitionDiveVolumeRows.rows.filter(volume=>volume.diveCode===row.diveCode&&matchesCompetitionDiveHeight(volume.height,volume.heightLabel,row.height,row.platformHeight)).reduce((sum,volume)=>sum+volume.volume,0)})),
    competitionConfidence:confidenceRows.map(row=>({competitionDiveId:row.competitionDiveId,code:row.diveCode,height:row.height,rating:row.rating,evaluator:row.evaluator,evaluatedAt:row.evaluatedAt.toISOString()})),confidenceSchemaUnavailable,
    diveNotes:diveNoteRows.rows.map(row=>({id:row.poolDiveId,code:row.diveCode,name:row.diveName,height:row.height,note:row.note,updatedAt:row.updatedAt,sessionId:row.sessionId,sessionTitle:row.sessionTitle,sessionDate:row.sessionDate})),progress,
    attendance:{absent:absenceRows.rows.length,total:attendanceRows.rows.length,rate:attendanceRows.rows.length?Math.round(absenceRows.rows.length/attendanceRows.rows.length*100):0}
  };
  return <AthleteDetail profile={profile} groups={groupOptions} />;
}

function DemoAthleteDetailPage({ id }: { id: string }) {
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
        skills: [
          { code: "201B", name: "Arriere carpe", status: "DEVELOPING", progress: 68, trainings: 8, repetitions: 31 },
          { code: "301C", name: "Retour groupe", status: "LEARNING", progress: 44, trainings: 5, repetitions: 18 },
          { code: "101C", name: "Avant groupe", status: "MASTERED", progress: 92, trainings: 16, repetitions: 70 }
        ],
        competitionLists: [{ id: "demo-list", name: "Liste de compétition" }],
        competitionDives: [
          { id: "competition-1", listId: "demo-list", height: "ONE_METER", platformHeight: null, code: "203C", difficulty: 2, volume: 0 },
          { id: "competition-2", listId: "demo-list", height: "ONE_METER", platformHeight: null, code: "201B", difficulty: 1.6, volume: 0 },
          { id: "competition-3", listId: "demo-list", height: "THREE_METER", platformHeight: null, code: "405C", difficulty: 3.1, volume: 0 }
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
      demo
    />
  );
}

function AthleteDetail({ profile, groups = [], demo = false }: { profile: AthleteProfile; groups?: Array<{id:string;name:string}>; demo?: boolean }) {
  const fullName = `${profile.firstName} ${profile.lastName}`;
  const nextCompetition = profile.nextCompetition;
  const activeList = profile.competitionLists[0];
  const activeListDives = activeList ? profile.competitionDives.filter((dive)=>dive.listId===activeList.id).map((dive)=>({...dive,note:profile.diveNotes.find((note)=>note.code===dive.code)?.note??null})) : [];
  const skillProgress = profile.skills.length ? Math.round(profile.skills.reduce((sum,skill)=>sum+skill.progress,0)/profile.skills.length) : 0;
  const volumePoints = profile.progress.chartData.slice(-7);
  const volumeValues = volumePoints.map((point) => point.volume);
  const volumeMin = Math.min(0, ...volumeValues);
  const volumeMax = Math.max(1, ...volumeValues);
  const volumeLine = volumePoints.map((point,index) => `${volumePoints.length < 2 ? 50 : index/(volumePoints.length-1)*100},${38-(point.volume-volumeMin)/(volumeMax-volumeMin)*30}`).join(" ");
  const wellnessPoints = profile.competitionConfidence.slice(-7);
  const wellnessValues = wellnessPoints.map(point=>point.rating*2);
  const wellnessMin = Math.min(0,...wellnessValues);
  const wellnessMax = Math.max(10,...wellnessValues);
  const wellnessLine = wellnessPoints.map((point,index)=>`${wellnessPoints.length<2?50:index/(wellnessPoints.length-1)*100},${38-(point.rating*2-wellnessMin)/(wellnessMax-wellnessMin)*30}`).join(" ");
  const evaluations = profile.competitionConfidence;
  const evaluationDates = new Set(evaluations.map((item)=>item.evaluatedAt));
  const athleteRatings = evaluations.filter((item)=>item.evaluator==="ATHLETE").map((item)=>item.rating);
  const athleteAverage = athleteRatings.length ? athleteRatings.reduce((sum,rating)=>sum+rating,0)/athleteRatings.length : null;
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
        <section className="athlete-panel"><h2>État actuel</h2><div className="athlete-state-grid"><div><span>Progression</span><b>{profile.skills.length?`${skillProgress}%`:"—"}</b><i>{profile.skills.length} compétences</i></div><div><span>Assiduité</span><b>{profile.attendance.total?`${Math.max(0,100-profile.attendance.rate)}%`:"—"}</b><i>présence saison</i></div></div></section>
      </div>
      <section className="athlete-panel"><h2>Charge d’entraînement par famille de plongeon</h2><div className="athlete-family-bars">{profile.progress.skillData.slice(0,6).map((item)=>{const max=Math.max(1,...profile.progress.skillData.map(skill=>skill.volume));return <div className="athlete-family-row" key={item.name}><span>{item.name}</span><i><b style={{width:`${Math.max(2,item.volume/max*100)}%`,background:diveFamilyColors[item.name]??"#94a3b8"}}/></i><strong>{item.volume}</strong></div>})}{profile.progress.skillData.length===0&&<p className="athlete-empty">Aucune donnée de volume par famille.</p>}</div></section>
      <section className="athlete-panel"><h2>Évolution du volume</h2><div className="athlete-volume-chart"><div className="athlete-volume-y"><span>{volumeMax}</span><span>{Math.round(volumeMax/2)}</span><span>0</span></div><svg viewBox="0 0 100 44" preserveAspectRatio="none" role="img" aria-label="Évolution du volume de plongeons"><polyline points={volumeLine} fill="none" stroke="#0eb9cb" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>{volumePoints.map((point,index)=><circle key={`${point.name}-${index}`} cx={volumePoints.length<2?50:index/(volumePoints.length-1)*100} cy={38-(point.volume-volumeMin)/(volumeMax-volumeMin)*30} r="1.4" fill="#0eb9cb" vectorEffect="non-scaling-stroke"/>)}</svg><div className="athlete-volume-x"><span>{volumePoints[0]?.name??"Début"}</span><span>{volumePoints[Math.floor(volumePoints.length/2)]?.name??""}</span><span>{volumePoints.at(-1)?.name??"Récent"}</span></div></div></section>
    </main>
    <aside className="athlete-dashboard-side">
      <section className="athlete-panel"><div className="athlete-panel-title"><h2>Prochaine compétition</h2>{nextCompetition&&<ChevronRight className="h-4 w-4"/>}</div>{nextCompetition?<div className="athlete-event-card"><div className="athlete-event-art"><Trophy className="h-7 w-7"/></div><div><b>{nextCompetition.title}</b><small>{formatMontrealDate(nextCompetition.startsAt,{day:"numeric",month:"short",year:"numeric"})}</small>{nextCompetition.endsAt&&<small>Au {formatMontrealDate(nextCompetition.endsAt)}</small>}</div><span className="athlete-countdown"><small>Dans</small><b>{formatMontrealCountdown(nextCompetition.startsAt)}</b></span></div>:<p className="athlete-empty">Aucune compétition prévue.</p>}</section>
      <section className="athlete-panel"><h2>Tendances bien-être</h2><div className="athlete-wellbeing"><strong>{wellnessValues.length?`${(wellnessValues.reduce((sum,value)=>sum+value,0)/wellnessValues.length).toFixed(1)}`:"—"}</strong><span>/ 10 · confiance en compétition</span></div><div className="athlete-wellbeing-chart"><svg viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true"><polyline points={wellnessLine} fill="none" stroke="#ff526e" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>{wellnessPoints.map((point,index)=><circle key={`${point.competitionDiveId}-${point.evaluatedAt}`} cx={wellnessPoints.length<2?50:index/(wellnessPoints.length-1)*100} cy={38-(point.rating*2-wellnessMin)/(wellnessMax-wellnessMin)*30} r="1.4" fill="#ff526e" vectorEffect="non-scaling-stroke"/>)}</svg><div className="athlete-wellbeing-labels"><span>{wellnessPoints[0]?formatMontrealDate(new Date(wellnessPoints[0].evaluatedAt),{day:"numeric",month:"short"}):"—"}</span><span>{wellnessPoints[Math.floor(wellnessPoints.length/2)]?formatMontrealDate(new Date(wellnessPoints[Math.floor(wellnessPoints.length/2)].evaluatedAt),{day:"numeric",month:"short"}):""}</span><span>{wellnessPoints.at(-1)?formatMontrealDate(new Date(wellnessPoints.at(-1)!.evaluatedAt),{day:"numeric",month:"short"}):"—"}</span></div></div></section>
      <section className="athlete-panel" id="athlete-notes"><div className="athlete-panel-title"><h2>Derniers commentaires de l’athlète</h2></div>{profile.diveNotes.slice(0,3).map(note=><div className="athlete-note-row" key={note.id}><span className="athlete-icon-box"><FileText className="h-4 w-4"/></span><div><b>{formatMontrealDate(note.sessionDate,{day:"numeric",month:"short"})} · {note.code} · {note.height === "ONE_METER" ? "1 m" : note.height === "THREE_METER" ? "3 m" : note.height === "PLATFORM" ? "Plateforme" : note.height.replaceAll("_", " ")}</b><p>{note.note}</p></div><ChevronRight className="h-4 w-4 shrink-0"/></div>)}{profile.diveNotes.length===0&&<p className="athlete-empty">Aucun commentaire pour le moment.</p>}</section>
      <section className="athlete-panel"><div className="athlete-panel-title"><h2>Séances récentes</h2></div><div className="athlete-session-list">{profile.recentSessions.slice(0,6).map(session=><Link key={session.id} href={demo?"/coach/sessions/demo":`/coach/sessions/${session.id}`}><span>{formatMontrealDate(session.date,{day:"numeric",month:"short"})}</span><b>{session.title}</b><em>{session.poolActual} reps</em><ChevronRight className="h-3.5 w-3.5"/></Link>)}{profile.recentSessions.length===0&&<p className="athlete-empty">Aucune séance terminée.</p>}</div></section>
      <section className="athlete-panel"><h2>Compétences</h2>{profile.skills.slice(0,5).map(skill=><div className="athlete-skill-row" key={`${skill.code}-${skill.name}`}><div><b>{skill.code} · {skill.name}</b><span>{skill.progress}%</span></div><i><b style={{width:`${Math.min(100,skill.progress)}%`}}/></i></div>)}{profile.skills.length===0&&<p className="athlete-empty">Aucune compétence suivie.</p>}</section>
    </aside>
  </div>;
  const evaluationsTab = <div className="athlete-evaluations-page">
    <div className="athlete-evaluation-stats">
      <div><small>Évaluations enregistrées</small><b>{evaluationDates.size}</b><span>depuis le début du suivi</span></div>
      <div><small>Ressenti moyen de l’athlète</small><b>{athleteAverage===null?"—":`${athleteAverage.toFixed(1)} / 5`}</b><span>{athleteRatings.length} notes de confiance</span></div>
      <div><small>Dernière évaluation</small><b>{latestEvaluation?formatMontrealDate(new Date(latestEvaluation.evaluatedAt),{day:"numeric",month:"short",year:"numeric"}):"Aucune"}</b><span>{latestEvaluation?`${latestEvaluation.evaluator==="COACH"?"Coach":"Athlète"} · ${latestEvaluation.code}`:"Aucune évaluation enregistrée"}</span></div>
    </div>
    <CompetitionConfidenceChart data={evaluations}/>
    {profile.confidenceSchemaUnavailable?<p className="athlete-warning">Les évaluations sont temporairement indisponibles. Une migration de la base de données est requise pour les consulter ou en saisir.</p>:<CoachCompetitionEvaluationForm athleteId={profile.id} dives={activeListDives.map(({id,code,height,platformHeight})=>({id,code,height,platformHeight}))}/>}
  </div>;
  const competitionTab = <CompetitionListPreview name={activeList?.name??"Liste de compétition"} dives={activeListDives}/>;
  const historyTab = <section className="athlete-panel athlete-history-full" id="all-sessions"><h2>Historique des séances</h2>{profile.recentSessions.map(session=><div className="athlete-history-row" key={`${session.id}-${session.date.toISOString()}`}><div><b>{session.title}</b><small>{formatMontrealDate(session.date,{weekday:"short",day:"2-digit",month:"short"})} · {session.poolActual}/{session.poolPlanned} reps</small>{(session.rating||session.note)&&<p>{session.rating??""}{session.note?` · ${session.note}`:""}</p>}</div><StatusPill status={session.status}/><Button asChild size="sm" variant="outline"><Link href={demo?"/coach/sessions/demo":`/coach/sessions/${session.id}`}>Ouvrir</Link></Button></div>)}</section>;

  return <CoachShell active="Athletes">
    <div className="athlete-dashboard">
      <header className="athlete-profile-head">
        <div className="athlete-identity"><Avatar className="h-14 w-14 border-0 bg-cyan-100 text-cyan-700"><AvatarImage src={profile.avatar ?? undefined}/><AvatarFallback>{profile.firstName[0]}{profile.lastName[0]}</AvatarFallback></Avatar><div><h1>{fullName}</h1><p>Plongeon de compétition · {profile.groupName}{profile.birthDate ? ` · ${formatMontrealDate(profile.birthDate,{year:"numeric"})}` : ""}</p><div className="athlete-tags"><Badge variant="success">{profile.level}</Badge><Badge variant="outline">{profile.groupName}</Badge><Badge variant="outline">{profile.active ? "Actif" : "Inactif"}</Badge></div></div></div>
        <div className="athlete-head-actions">{profile.nextSession&&<Button asChild size="sm" variant="outline"><Link href={demo?"/coach/sessions/demo":`/coach/sessions/${profile.nextSession.id}`}><CalendarDays className="h-4 w-4"/> Prochaine séance</Link></Button>}<AthleteActionsMenu athlete={{id:profile.id,firstName:profile.firstName,lastName:profile.lastName,level:profile.level,groupId:profile.groupId??null,birthDate:profile.birthDate?formatMontrealDate(profile.birthDate,{year:"numeric",month:"2-digit",day:"2-digit"}).replace(/\//g,"-"):null,active:profile.active}} groups={groups} demo={demo} directEdit/></div>
      </header>
      <AthleteProfileTabs overview={overview} evaluations={evaluationsTab} competition={competitionTab} history={historyTab}/>
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
