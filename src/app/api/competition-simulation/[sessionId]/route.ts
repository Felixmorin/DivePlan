import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { getCurrentAthleteIdentity } from "@/lib/athlete-session";
import { query, withTransaction } from "@/lib/db";
import { eligibleSimulationJudges, type CompetitionTurn } from "@/lib/competition-simulation";

export const dynamic = "force-dynamic";

type SimulationRow = { id: string; sessionId: string; status: string; currentTurnIndex: number; turns: CompetitionTurn[]; coachId: string; clubId: string; sessionStatus: string };

async function getSimulation(sessionId: string, clubId?: string): Promise<SimulationRow | null> {
  return (await query<SimulationRow>(
    `SELECT cs.id,cs."sessionId",cs.status,cs."currentTurnIndex",cs.turns,s."coachId",s.status AS "sessionStatus",w."clubId" FROM "CompetitionSimulation" cs JOIN "TrainingSession" s ON s.id=cs."sessionId" JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE cs."sessionId"=$1 AND ($2::text IS NULL OR w."clubId"=$2)`,
    [sessionId, clubId ?? null]
  )).rows[0] ?? null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const athlete = await getCurrentAthleteIdentity();
  let coachId: string | null = null;
  let clubId: string | undefined;
  if (!athlete) {
    const coach = await requireCoach();
    coachId = coach.coach.id;
    clubId = coach.clubId;
  }
  const simulation = await getSimulation(sessionId, clubId);
  if (!simulation) return Response.json({ error: "Simulation introuvable." }, { status: 404 });
  if (!["READY", "IN_PROGRESS", "COMPLETED"].includes(simulation.sessionStatus)) return Response.json({ error: "La séance n’est pas publiée." }, { status: 409 });
  if (coachId && coachId !== simulation.coachId) return Response.json({ error: "Seul l’entraîneur de cette séance peut gérer la simulation." }, { status: 403 });
  if (athlete) {
    const allowed = simulation.turns.some((turn) => turn.athleteId === athlete.id);
    if (!allowed) return Response.json({ error: "Accès refusé." }, { status: 403 });
    const started = await query(`SELECT 1 FROM "AthleteSessionCompletion" WHERE "sessionId"=$1 AND "athleteId"=$2 AND status IN ('IN_PROGRESS','COMPLETED') LIMIT 1`, [sessionId, athlete.id]);
    if (!started.rowCount) return Response.json({ error: "Commence la séance avant de rejoindre la simulation." }, { status: 403 });
  }
  const turnIndex = simulation.currentTurnIndex;
  const turn = simulation.turns[turnIndex] ?? null;
  const eligible = turn ? eligibleSimulationJudges(simulation.turns, turnIndex) : [];
  const [scores, names] = turn ? await Promise.all([
    query<{ turnIndex: number; judgeAthleteId: string | null; judgeCoachId: string | null; rating: number }>(`SELECT "turnIndex","judgeAthleteId","judgeCoachId",rating FROM "CompetitionSimulationScore" WHERE "simulationId"=$1 AND ${simulation.status === "COMPLETED" ? "TRUE" : '"turnIndex"=$2'}`, simulation.status === "COMPLETED" ? [simulation.id] : [simulation.id, turnIndex]),
    query<{ id: string; name: string }>(`SELECT a.id,u."firstName" || ' ' || u."lastName" AS name FROM "Athlete" a JOIN "User" u ON u.id=a."userId" WHERE a.id=ANY($1::text[])`, [eligible])
  ]) : [{ rows: [] as { turnIndex: number; judgeAthleteId: string | null; judgeCoachId: string | null; rating: number }[] }, { rows: [] as { id: string; name: string }[] }];
  const currentScores = scores.rows.filter((score) => score.turnIndex === turnIndex);
  const ownScore = currentScores.find((score) => athlete ? score.judgeAthleteId === athlete.id : score.judgeCoachId === coachId);
  const receivedIds = new Set(currentScores.flatMap((score) => score.judgeAthleteId ? [score.judgeAthleteId] : []));
  return Response.json({
    status: simulation.status,
    turnIndex,
    totalTurns: simulation.turns.length,
    turn,
    completedTurns: simulation.status === "COMPLETED" ? simulation.turns : [],
    nextDiver: simulation.turns.length ? simulation.turns[(turnIndex + 1) % simulation.turns.length] : null,
    role: athlete ? (turn?.athleteId === athlete.id ? "DIVER" : eligible.includes(athlete.id) ? "JUDGE" : "NEXT") : "COACH",
    eligibleCount: eligible.length,
    receivedCount: currentScores.length,
    expectedCount: eligible.length + 1,
    ownRating: ownScore?.rating ?? null,
    pendingJudges: names.rows.filter((item) => !receivedIds.has(item.id)).map((item) => item.name),
    scores: simulation.status === "COMPLETED" ? scores.rows.map((score) => ({ turnIndex: score.turnIndex, judgeAthleteId: score.judgeAthleteId, judgeCoachId: score.judgeCoachId, rating: score.rating })) : []
  }, { headers: { "Cache-Control": "no-store" } });
}

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("vote"), turnIndex: z.number().int().nonnegative(), rating: z.number().int().min(0).max(10) }),
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("advance"), force: z.boolean().default(false) })
]);

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Action invalide." }, { status: 400 });
  const athlete = await getCurrentAthleteIdentity();
  let coach: Awaited<ReturnType<typeof requireCoach>> | null = null;
  if (!athlete) coach = await requireCoach();
  const simulation = await getSimulation(sessionId, coach?.clubId);
  if (!simulation) return Response.json({ error: "Simulation introuvable." }, { status: 404 });
  if (!["READY", "IN_PROGRESS", "COMPLETED"].includes(simulation.sessionStatus)) return Response.json({ error: "La séance n’est pas publiée." }, { status: 409 });
  if (coach && coach.coach.id !== simulation.coachId) return Response.json({ error: "Seul l’entraîneur de cette séance peut gérer la simulation." }, { status: 403 });
  const turnIndex = simulation.currentTurnIndex;
  const turn = simulation.turns[turnIndex];
  if (parsed.data.action === "vote") {
    if (simulation.status !== "LIVE" || !turn) return Response.json({ error: "La simulation n’accepte pas de vote maintenant." }, { status: 409 });
    if (parsed.data.turnIndex !== turnIndex) return Response.json({ error: "Le passage a changé. Actualise l’écran." }, { status: 409 });
    if (athlete && (!simulation.turns.some((item) => item.athleteId === athlete.id) || !eligibleSimulationJudges(simulation.turns, turnIndex).includes(athlete.id))) return Response.json({ error: "Tu n’es pas juge pour ce passage." }, { status: 403 });
    if (athlete) {
      const started = await query(`SELECT 1 FROM "AthleteSessionCompletion" WHERE "sessionId"=$1 AND "athleteId"=$2 AND status IN ('IN_PROGRESS','COMPLETED') LIMIT 1`, [sessionId, athlete.id]);
      if (!started.rowCount) return Response.json({ error: "Commence la séance avant d’envoyer une note." }, { status: 403 });
    }
    try {
      const saved = await withTransaction(async (tx) => {
        const locked = await tx.query<{ status: string; currentTurnIndex: number }>(`SELECT status,"currentTurnIndex" FROM "CompetitionSimulation" WHERE id=$1 FOR UPDATE`, [simulation.id]);
        const current = locked.rows[0];
        if (current?.status !== "LIVE" || current.currentTurnIndex !== turnIndex) return false;
        await tx.query(`INSERT INTO "CompetitionSimulationScore" (id,"simulationId","turnIndex","judgeAthleteId","judgeCoachId",rating) VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(), simulation.id, turnIndex, athlete?.id ?? null, coach?.coach.id ?? null, parsed.data.rating]);
        return true;
      });
      if (!saved) return Response.json({ error: "Le passage a changé. Actualise l’écran." }, { status: 409 });
    } catch (error) {
      if ((error as { code?: string })?.code !== "23505") throw error;
      return Response.json({ error: "Ta note est déjà enregistrée." }, { status: 409 });
    }
    return Response.json({ ok: true });
  }
  if (!coach) return Response.json({ error: "Accès refusé." }, { status: 403 });
  if (parsed.data.action === "start") {
    const started = await withTransaction(async (tx) => {
      const locked = await tx.query<{ status: string; sessionStatus: string }>(`SELECT cs.status,s.status AS "sessionStatus" FROM "CompetitionSimulation" cs JOIN "TrainingSession" s ON s.id=cs."sessionId" WHERE cs.id=$1 FOR UPDATE OF cs`, [simulation.id]);
      if (locked.rows[0]?.status !== "READY" || !["READY", "IN_PROGRESS"].includes(locked.rows[0]?.sessionStatus ?? "")) return false;
      await tx.query(`UPDATE "CompetitionSimulation" SET status='LIVE',"updatedAt"=NOW() WHERE id=$1`, [simulation.id]);
      return true;
    });
    if (!started) return Response.json({ error: "La simulation ne peut pas démarrer maintenant." }, { status: 409 });
  } else {
    if (simulation.status !== "LIVE" || !turn) return Response.json({ error: "Aucun passage actif." }, { status: 409 });
    const advanced = await withTransaction(async (tx) => {
      const locked = await tx.query<{ status: string; currentTurnIndex: number; sessionStatus: string }>(`SELECT cs.status,cs."currentTurnIndex",s.status AS "sessionStatus" FROM "CompetitionSimulation" cs JOIN "TrainingSession" s ON s.id=cs."sessionId" WHERE cs.id=$1 FOR UPDATE OF cs`, [simulation.id]);
      const current = locked.rows[0];
      if (current?.status !== "LIVE" || current.currentTurnIndex !== turnIndex || !["READY", "IN_PROGRESS", "COMPLETED"].includes(current.sessionStatus)) return { error: "Le passage a déjà changé." };
      const expected = eligibleSimulationJudges(simulation.turns, turnIndex).length + 1;
      const voteCounts = (await tx.query<{ received: number; coachVotes: number }>(`SELECT count(*)::int AS received,count(*) FILTER (WHERE "judgeCoachId" IS NOT NULL)::int AS "coachVotes" FROM "CompetitionSimulationScore" WHERE "simulationId"=$1 AND "turnIndex"=$2`, [simulation.id, turnIndex])).rows[0] ?? { received: 0, coachVotes: 0 };
      if (!voteCounts.coachVotes) return { error: "Le coach doit enregistrer sa note avant de passer au plongeur suivant." };
      if (voteCounts.received < expected && !parsed.data.force) return { error: `${voteCounts.received}/${expected} notes reçues.` };
      if (turnIndex + 1 >= simulation.turns.length) await tx.query(`UPDATE "CompetitionSimulation" SET status='COMPLETED',"updatedAt"=NOW() WHERE id=$1`, [simulation.id]);
      else await tx.query(`UPDATE "CompetitionSimulation" SET "currentTurnIndex"="currentTurnIndex"+1,"updatedAt"=NOW() WHERE id=$1`, [simulation.id]);
      return { error: null };
    });
    if (advanced.error) return Response.json({ error: advanced.error }, { status: 409 });
  }
  return Response.json({ ok: true });
}
