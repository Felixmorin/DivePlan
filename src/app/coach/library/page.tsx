import { CoachShell } from "@/components/coach/coach-shell";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { sessionTemplatePayloadSchema } from "@/lib/session-template";
import { LibraryClient } from "./library-client";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const { clubId } = await requireCoach();
  if (clubId === "dev-club") return <CoachShell active="Bibliotheque"><LibraryClient exercises={[]} dives={[]} templates={[]} /></CoachShell>;
  const [exerciseResult, diveResult, templateResult] = await Promise.all([
    query<{ id: string; name: string; category: string; description: string; bodyArea: string | null; equipment: string | null; setup: string | null; defaultSets: number | null; defaultReps: number | null; defaultDuration: number | null; roundTrip: boolean; restSeconds: number | null; coachNotes: string | null; favorite: boolean; lastUsed: Date | null }>(
      `SELECT e.id, e.name, e.category, e.description, e."bodyArea", e.equipment, e.setup, e."defaultSets", e."defaultReps", e."defaultDuration", e."roundTrip", e."restSeconds", e."coachNotes", e.favorite,
       (SELECT max(s.date) FROM "DrylandBlockExercise" x JOIN "SessionBlock" b ON b.id = x."blockId" JOIN "TrainingSession" s ON s.id = b."sessionId" JOIN "TrainingWeek" w ON w.id = s."weekId" WHERE x."exerciseId" = e.id AND w."clubId" = $1) AS "lastUsed"
       FROM "DrylandExercise" e WHERE e."archivedAt" IS NULL ORDER BY e.name ASC`, [clubId]
    ),
    query<{ diveCode: string; diveName: string; position: string; height: string }>(
      `SELECT d."diveCode", d."diveName", d.position, s.height FROM "PoolDive" d JOIN "PoolSection" s ON s.id = d."poolSectionId"
       JOIN "PoolTraining" p ON p."blockId" = s."poolTrainingId" JOIN "SessionBlock" b ON b.id = p."blockId"
       JOIN "TrainingSession" ts ON ts.id = b."sessionId" JOIN "TrainingWeek" w ON w.id = ts."weekId"
       WHERE w."clubId" = $1 ORDER BY d."diveCode" ASC, d."order" ASC`, [clubId]
    ),
    query<{ id: string; name: string; category: string; favorite: boolean; payload: unknown }>(`SELECT id, name, category, favorite, payload FROM "SessionTemplate" WHERE "clubId" = $1 ORDER BY favorite DESC, name ASC LIMIT 200`, [clubId])
  ]);
  const exercises = exerciseResult.rows.map((exercise) => ({ ...exercise, lastUsed: exercise.lastUsed?.toISOString() ?? null }));
  const dives = diveResult.rows.map((dive) => ({ code: dive.diveCode, name: dive.diveName, heights: [dive.height === "ONE_METER" ? "1 m" : dive.height === "THREE_METER" ? "3 m" : "Autre"], family: familyForDive(dive.diveCode, dive.position) }));
  const templates = templateResult.rows.filter((template) => !["Dryland", "Piscine"].includes(template.category)).map((template) => ({ id: template.id, name: template.name, category: template.category, favorite: template.favorite, blocks: sessionTemplatePayloadSchema.safeParse(template.payload).success ? sessionTemplatePayloadSchema.parse(template.payload).blocks.length : 0 }));
  return <CoachShell active="Bibliotheque"><LibraryClient exercises={exercises} dives={dives} templates={templates} /></CoachShell>;
}

function familyForDive(code: string, position: string) {
  const familyByCode: Record<string, string> = { "1": "Avant", "2": "Arrière", "3": "Renversé", "4": "Retourné", "5": "Vrille" };
  if (familyByCode[code.charAt(0)]) return familyByCode[code.charAt(0)];
  const value = position.toLowerCase();
  if (value.includes("arrière") || value.includes("arriere")) return "Arrière";
  if (value.includes("renvers")) return "Renversé";
  if (value.includes("retourn")) return "Retourné";
  if (value.includes("vrill")) return "Vrille";
  return "Avant";
}
