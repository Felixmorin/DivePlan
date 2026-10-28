import { CoachShell } from "@/components/coach/coach-shell";
import { SessionBuilder } from "@/components/coach/session-builder";
import { createDrylandExercise, createTrainingSession } from "@/app/coach/sessions/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCoach } from "@/lib/current-user";
import { query, setDatabaseEgressRoute } from "@/lib/db";
import { resolveAvatarUrls } from "@/lib/avatar-storage";
import { buildSessionTemplatePayload, getSessionSnapshots, parseSessionTemplatePayload } from "@/lib/session-template";
import { getCoachPoolInsights } from "@/lib/coach-pool-insights";
import Link from "@/components/ui/app-link";

export const dynamic = "force-dynamic";

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ templateId?: string; exerciseId?: string; planningEventId?: string }> }) {
  setDatabaseEgressRoute("/coach/sessions/new");
  const { clubId } = await requireCoach();
  const { templateId, exerciseId, planningEventId } = await searchParams;
  if (clubId === "dev-club") {
    return (
      <CoachShell active="Seances">
        <div className="mb-6">
          <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Séance</p>
          <h1 className="mt-2 text-3xl font-black">Nouvelle séance</h1>
          <p className="mt-1 text-[var(--color-ink-muted)]">Mode demo local sans PostgreSQL.</p>
        </div>
        <Card>
          <CardHeader><CardTitle>Base de donnees requise</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-[var(--color-ink-muted)]">La creation de seance doit sauvegarder des blocs, exercices et assignations. Configure un `DATABASE_URL` valide pour utiliser ce module.</p>
            <Button asChild variant="action"><Link href="/coach/sessions/demo">Ouvrir la seance demo</Link></Button>
          </CardContent>
        </Card>
      </CoachShell>
    );
  }

  const [groupsR, athletesR, drylandR, templateR, eventsR, templatesR, recentSessionIdsR] = await Promise.all([
    query<{id:string;name:string}>(`SELECT id,name FROM "TrainingGroup" WHERE "clubId"=$1 ORDER BY name`,[clubId]),
    query<{id:string;groupId:string;level:string;firstName:string;lastName:string;avatar:string|null}>(`SELECT a.id,a."groupId",a.level,u."firstName",u."lastName",u.avatar FROM "Athlete" a JOIN "User" u ON u.id=a."userId" WHERE a."clubId"=$1 AND a.active=true ORDER BY u."firstName"`,[clubId]),
    query<{id:string;name:string;category:string;defaultSets:number|null;defaultReps:number|null;defaultDuration:number|null;roundTrip:boolean;equipment:string|null;tags:string[]}>(`SELECT id,name,category,"defaultSets","defaultReps","defaultDuration","roundTrip",equipment,tags FROM "DrylandExercise" WHERE "archivedAt" IS NULL ORDER BY name`),
    templateId ? query<{id:string;name:string;category:string;payload:unknown}>(`SELECT id,name,category,payload FROM "SessionTemplate" WHERE id=$1 AND "clubId"=$2`,[templateId,clubId]) : Promise.resolve(null),
    query<{id:string;title:string;startsAt:Date;duration:number|null;groupId:string;location:string|null}>(`SELECT id,title,"startsAt",duration,"groupId",location FROM "PlanningEvent" WHERE "clubId"=$1 AND type='TRAINING_SCHEDULE' ORDER BY "startsAt"`,[clubId]),
    query<{id:string;name:string;category:string;payload:unknown}>(`SELECT id,name,category,payload FROM "SessionTemplate" WHERE "clubId"=$1 ORDER BY favorite DESC,name ASC LIMIT 100`,[clubId]),
    query<{id:string;title:string;date:Date;groupId:string}>(`SELECT s.id,s.title,s.date,w."groupId" FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE w."clubId"=$1 ORDER BY s.date DESC LIMIT 8`,[clubId])
  ]);
  const groups=groupsR.rows;
  const athletePoolAveragesR = athletesR.rows.length > 0
    ? await query<{ athleteId: string; average: number | string }>(
      `SELECT c."athleteId", ROUND(SUM(l."repetitionsCompleted")::numeric / COUNT(DISTINCT l."sessionId")) AS average
       FROM "AthleteSessionCompletion" c
       JOIN "TrainingSession" s ON s.id = c."sessionId"
       JOIN "TrainingWeek" w ON w.id = s."weekId"
       JOIN "AthleteDiveLog" l ON l."athleteId" = c."athleteId" AND l."sessionId" = c."sessionId"
       WHERE c."athleteId" = ANY($1::text[]) AND w."clubId" = $2 AND c.status = 'COMPLETED'
       GROUP BY c."athleteId"`,
      [athletesR.rows.map((athlete) => athlete.id), clubId]
    )
    : { rows: [] as { athleteId: string; average: number | string }[] };
  const [athletePoolInsightsById] = await Promise.all([getCoachPoolInsights(athletesR.rows.map((athlete) => athlete.id), clubId)]);
  const athletePoolAverageById = Object.fromEntries(athletePoolAveragesR.rows.map((row) => [row.athleteId, Number(row.average)]));
  const athleteAvatarUrls = await resolveAvatarUrls(athletesR.rows.map((athlete) => athlete.avatar));
  const athletes=athletesR.rows.map((a,index)=>({id:a.id,groupId:a.groupId,level:a.level,user:{firstName:a.firstName,lastName:a.lastName,avatar:athleteAvatarUrls[index]}}));
  const drylandLibrary=drylandR.rows;
  const template=templateR?.rows[0]??null;
  const planningEvents=eventsR.rows;
  const initialTemplate = template && !["Dryland", "Piscine"].includes(template.category)
    ? {
        id: template.id,
        name: template.name,
        category: template.category,
        payload: parseSessionTemplatePayload(template.payload)
      }
    : null;
  const templates = templatesR.rows.flatMap((item) => {
    const parsed = (() => { try { return parseSessionTemplatePayload(item.payload); } catch { return null; } })();
    return parsed ? [{ id: item.id, name: item.name, category: item.category, payload: parsed }] : [];
  });
  const recentSnapshots = await getSessionSnapshots(recentSessionIdsR.rows.map((item) => item.id), clubId);
  const recentSessions = recentSessionIdsR.rows.flatMap((item) => {
    const snapshot = recentSnapshots.get(item.id);
    return snapshot ? [{ id: item.id, title: item.title, date: item.date, groupId: item.groupId, payload: buildSessionTemplatePayload(snapshot) }] : [];
  });

  return (
    <CoachShell active="Seances">
      <div className="mb-6">
        <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Séance</p>
        <h1 className="mt-2 text-3xl font-black">Nouvelle séance</h1>
      </div>
      {groups.length === 0 || athletes.length === 0 ? (
        <EmptyState title="Prépare l’effectif avant de créer une séance" description="Ajoute au moins un groupe et un athlète actif. Tu pourras ensuite composer une séance piscine, dryland ou mixte." action={<Button asChild><Link href="/coach/athletes">Gérer les athlètes</Link></Button>} />
      ) : (
        <SessionBuilder
          athletes={athletes.map((athlete) => ({
            id: athlete.id,
            groupId: athlete.groupId,
            firstName: athlete.user.firstName,
            lastName: athlete.user.lastName,
            level: athlete.level,
            avatar: athlete.user.avatar
          }))}
          drylandLibrary={drylandLibrary.map((exercise) => ({
            id: exercise.id,
            name: exercise.name,
            category: exercise.category,
            sets: exercise.defaultSets,
            reps: exercise.defaultReps,
            duration: exercise.defaultDuration,
            roundTrip: exercise.roundTrip,
            equipment: exercise.equipment,
            tags: exercise.tags
          }))}
          groups={groups}
          athletePoolAverageById={athletePoolAverageById}
          athletePoolInsightsById={athletePoolInsightsById}
          planningEvents={planningEvents.map((event) => ({ id: event.id, title: event.title, startsAt: event.startsAt, duration: event.duration, groupId: event.groupId, location: event.location }))}
          initialTemplate={initialTemplate}
          templates={templates}
          recentSessions={recentSessions}
          initialPlanningEventId={planningEventId}
          initialExerciseId={exerciseId}
          onCreate={createTrainingSession}
          onCreateExercise={createDrylandExercise}
        />
      )}
    </CoachShell>
  );
}
