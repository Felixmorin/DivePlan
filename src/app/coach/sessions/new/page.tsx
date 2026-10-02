import { CoachShell } from "@/components/coach/coach-shell";
import { SessionBuilder } from "@/components/coach/session-builder";
import { createDrylandExercise, createTrainingSession } from "@/app/coach/sessions/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { resolveAvatarUrls } from "@/lib/avatar-storage";
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
    query<{sessionId:string;sessionTitle:string;blockId:string;title:string;duration:number;position:number}>(`WITH recent AS (SELECT s.id,s.title,s.date FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE w."clubId"=$1 AND EXISTS (SELECT 1 FROM "SessionBlock" b JOIN "PoolTraining" p ON p."blockId"=b.id WHERE b."sessionId"=s.id) ORDER BY s.date DESC LIMIT 8) SELECT r.id AS "sessionId",r.title AS "sessionTitle",b.id AS "blockId",b.title,b.duration,b.position FROM recent r JOIN "SessionBlock" b ON b."sessionId"=r.id JOIN "PoolTraining" p ON p."blockId"=b.id ORDER BY r.date DESC,b.position ASC`,[clubId])
  ]);
  const groups=groupsR.rows;
  const athleteAvatarUrls = await resolveAvatarUrls(athletesR.rows.map((athlete) => athlete.avatar));
  const athletes=athletesR.rows.map((a,index)=>({id:a.id,groupId:a.groupId,level:a.level,user:{firstName:a.firstName,lastName:a.lastName,avatar:athleteAvatarUrls[index]}}));
  const drylandLibrary=drylandR.rows;
  const template=templateR?.rows[0]??null;
  const planningEvents=eventsR.rows;
  type PoolSectionRow = { id: string; poolTrainingId: string; height: SessionPoolHeight; label: string | null };
  type PoolDiveRow = { poolSectionId: string; diveCode: string; diveName: string; position: string; repetitions: number; notes: string | null; order: number };
  const blockIds = [...new Set(recentR.rows.map((row) => row.blockId))];
  const [assignmentsR, sectionsR] = blockIds.length > 0 ? await Promise.all([
    query<{ sessionBlockId: string; athleteId: string }>(`SELECT "sessionBlockId", "athleteId" FROM "SessionBlockAssignment" WHERE "sessionBlockId" = ANY($1::text[])`, [blockIds]),
    query<PoolSectionRow>(`SELECT id, "poolTrainingId", height, label FROM "PoolSection" WHERE "poolTrainingId" = ANY($1::text[]) ORDER BY "order"`, [blockIds])
  ]) : [{ rows: [] }, { rows: [] }];
  const sectionIds = sectionsR.rows.map((section) => section.id);
  const divesR = sectionIds.length > 0
    ? await query<PoolDiveRow>(`SELECT "poolSectionId", "diveCode", "diveName", position, repetitions, notes, "order" FROM "PoolDive" WHERE "poolSectionId" = ANY($1::text[]) ORDER BY "order"`, [sectionIds])
    : { rows: [] };
  const assignmentsByBlock = new Map<string, { athleteId: string }[]>();
  for (const assignment of assignmentsR.rows) {
    const blockAssignments = assignmentsByBlock.get(assignment.sessionBlockId) ?? [];
    blockAssignments.push({ athleteId: assignment.athleteId });
    assignmentsByBlock.set(assignment.sessionBlockId, blockAssignments);
  }
  const divesBySection = new Map<string, PoolDiveRow[]>();
  for (const dive of divesR.rows) {
    const sectionDives = divesBySection.get(dive.poolSectionId) ?? [];
    sectionDives.push(dive);
    divesBySection.set(dive.poolSectionId, sectionDives);
  }
  const sectionsByBlock = new Map<string, PoolSectionRow[]>();
  for (const section of sectionsR.rows) {
    const blockSections = sectionsByBlock.get(section.poolTrainingId) ?? [];
    blockSections.push(section);
    sectionsByBlock.set(section.poolTrainingId, blockSections);
  }
  const sessionsById = new Map<string, { id: string; blocks: { id: string; title: string; duration: number; assignments: { athleteId: string }[]; poolTraining: { sections: { height: SessionPoolHeight; label: string | null; dives: Omit<PoolDiveRow, "poolSectionId">[] }[] } | null }[] }>();
  for (const row of recentR.rows) {
    const session = sessionsById.get(row.sessionId) ?? { id: row.sessionId, blocks: [] };
    session.blocks.push({
      id: row.blockId,
      title: row.title,
      duration: row.duration,
      assignments: assignmentsByBlock.get(row.blockId) ?? [],
      poolTraining: {
        sections: (sectionsByBlock.get(row.blockId) ?? []).map((section) => ({
          height: section.height,
          label: section.label,
          dives: (divesBySection.get(section.id) ?? []).map((dive) => ({
            diveCode: dive.diveCode,
            diveName: dive.diveName,
            position: dive.position,
            repetitions: dive.repetitions,
            notes: dive.notes,
            order: dive.order
          }))
        }))
      }
    });
    sessionsById.set(row.sessionId, session);
  }
  const recentPoolSessions = [...sessionsById.values()];
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
