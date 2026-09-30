import { CoachShell } from "@/components/coach/coach-shell";
import { SessionBuilder } from "@/components/coach/session-builder";
import { createDrylandExercise, createTrainingSession } from "@/app/coach/sessions/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { parseSessionTemplatePayload } from "@/lib/session-template";
import type { SessionPoolHeight } from "@/lib/session-template";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ templateId?: string; exerciseId?: string }> }) {
  const { clubId } = await requireCoach();
  const { templateId, exerciseId } = await searchParams;
  if (clubId === "dev-club") {
    return (
      <CoachShell active="Seances">
        <div className="mb-6">
          <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Builder</p>
          <h1 className="mt-2 text-3xl font-black">Nouvelle seance</h1>
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

  const [groupsR, athletesR, drylandR, templateR, eventsR, recentR] = await Promise.all([
    query<{id:string;name:string}>(`SELECT id,name FROM "TrainingGroup" WHERE "clubId"=$1 ORDER BY name`,[clubId]),
    query<{id:string;groupId:string;level:string;firstName:string;lastName:string;avatar:string|null}>(`SELECT a.id,a."groupId",a.level,u."firstName",u."lastName",u.avatar FROM "Athlete" a JOIN "User" u ON u.id=a."userId" WHERE a."clubId"=$1 AND a.active=true ORDER BY u."firstName"`,[clubId]),
    query<{id:string;name:string;category:string;defaultSets:number|null;defaultReps:number|null;defaultDuration:number|null;roundTrip:boolean;equipment:string|null;tags:string[]}>(`SELECT id,name,category,"defaultSets","defaultReps","defaultDuration","roundTrip",equipment,tags FROM "DrylandExercise" WHERE "archivedAt" IS NULL ORDER BY name`),
    templateId ? query<{id:string;name:string;category:string;payload:unknown}>(`SELECT id,name,category,payload FROM "SessionTemplate" WHERE id=$1 AND "clubId"=$2`,[templateId,clubId]) : Promise.resolve(null),
    query<{id:string;title:string;startsAt:Date;groupId:string;location:string|null}>(`SELECT id,title,"startsAt","groupId",location FROM "PlanningEvent" WHERE "clubId"=$1 AND type='TRAINING_SCHEDULE' ORDER BY "startsAt"`,[clubId]),
  ]);
  const groups=groupsR.rows;
  const athletes=athletesR.rows.map(a=>({id:a.id,groupId:a.groupId,level:a.level,user:{firstName:a.firstName,lastName:a.lastName,avatar:a.avatar}}));
  const drylandLibrary=drylandR.rows;
  const template=templateR?.rows[0]??null;
  const planningEvents=eventsR.rows;
  const recentPoolSessions:( {id:string;blocks:{id:string;title:string;duration:number;assignments:{athleteId:string}[];poolTraining:{sections:{height:SessionPoolHeight;label:string|null;dives:{diveCode:string;diveName:string;position:string;repetitions:number;notes:string|null;order:number}[]}[]}|null}[]} )[]=[];
  for(const row of recentR.rows){let session=recentPoolSessions.find(s=>s.id===row.sessionId);if(!session){session={id:row.sessionId,blocks:[]};recentPoolSessions.push(session);}const block={id:row.blockId,title:row.title,duration:row.duration,assignments:(await query<{athleteId:string}>(`SELECT "athleteId" FROM "SessionBlockAssignment" WHERE "sessionBlockId"=$1`,[row.blockId])).rows,poolTraining:{sections:[] as {height:SessionPoolHeight;label:string|null;dives:{diveCode:string;diveName:string;position:string;repetitions:number;notes:string|null;order:number}[]}[]}};const sections=(await query<{id:string;height:SessionPoolHeight;label:string|null}>(`SELECT id,height,label FROM "PoolSection" WHERE "poolTrainingId"=$1 ORDER BY "order"`,[row.blockId])).rows;for(const section of sections)block.poolTraining.sections.push({...section,dives:(await query<{diveCode:string;diveName:string;position:string;repetitions:number;notes:string|null;order:number}>(`SELECT "diveCode","diveName",position,repetitions,notes,"order" FROM "PoolDive" WHERE "poolSectionId"=$1 ORDER BY "order"`,[section.id])).rows});session.blocks.push(block);}
  const poolBlocks = recentPoolSessions.flatMap((session) => session.blocks).filter((block) => block.poolTraining).slice(0, 3);
  const initialTemplate = template
    ? {
        id: template.id,
        name: template.name,
        category: template.category,
        payload: parseSessionTemplatePayload(template.payload)
      }
    : null;

  return (
    <CoachShell active="Seances">
      <div className="mb-6">
        <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Builder</p>
        <h1 className="mt-2 text-3xl font-black">Nouvelle seance</h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">Construire une seance complete en quelques minutes, avec blocs partageables et assignations fines.</p>
      </div>
      {groups.length === 0 || athletes.length === 0 || drylandLibrary.length === 0 ? (
        <EmptyState title="Donnees requises manquantes" description="Le builder a besoin d'un groupe, d'athletes actifs et d'exercices dryland pour publier une seance." action={<Button asChild><Link href="/coach/athletes">Verifier les athletes</Link></Button>} />
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
          planningEvents={planningEvents.map((event) => ({ id: event.id, title: event.title, startsAt: event.startsAt, groupId: event.groupId, location: event.location }))}
          poolBlocks={poolBlocks.map((block) => ({
            id: block.id,
            title: block.title,
            duration: block.duration,
            athleteIds: block.assignments.map((assignment) => assignment.athleteId),
            sections: block.poolTraining?.sections.map((section) => ({
              height: section.height,
              label: section.label,
              dives: section.dives.map((dive) => ({
                diveCode: dive.diveCode,
                diveName: dive.diveName,
                position: dive.position,
                repetitions: dive.repetitions,
                notes: dive.notes,
                order: dive.order
              }))
            })) ?? []
          }))}
          initialTemplate={initialTemplate}
          initialExerciseId={exerciseId}
          onCreate={createTrainingSession}
          onCreateExercise={createDrylandExercise}
        />
      )}
    </CoachShell>
  );
}
