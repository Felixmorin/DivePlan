import { NextResponse } from "next/server";
import { getCurrentAthlete } from "@/lib/athlete-session";
import { getAssignedSessionBlocks, persistAthleteProgress, type AthleteProgressPayload } from "@/lib/athlete-progress";
import { query } from "@/lib/db";
import { isSessionStartAvailable, SESSION_NOT_STARTED_MESSAGE } from "@/lib/session-availability";

export async function POST(request: Request) {
  const athlete = await getCurrentAthlete();

  if (!athlete) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: AthleteProgressPayload;

  try {
    payload = (await request.json()) as AthleteProgressPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!payload.sessionId || !Array.isArray(payload.exercises) || !Array.isArray(payload.dives) || !isSessionFeedback(payload.sessionFeedback)) {
    return NextResponse.json({ error: "Invalid progress payload" }, { status: 400 });
  }

  const assignedBlocks = await getAssignedSessionBlocks(payload.sessionId, athlete.id);

  if (assignedBlocks.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionResult = await query<{ date: Date; status: string; athleteStatus: string | null }>(
    `SELECT s.date, s.status, c.status AS "athleteStatus" FROM "TrainingSession" s
     LEFT JOIN "AthleteSessionCompletion" c ON c."sessionId"=s.id AND c."athleteId"=$2 WHERE s.id=$1 LIMIT 1`, [payload.sessionId, athlete.id]
  );
  const session = sessionResult.rows[0];

  const activeSessionWasClosedBySchedule = session?.status === "COMPLETED" && (session.athleteStatus === "IN_PROGRESS" || session.athleteStatus === "COMPLETED");
  if (!session || (!activeSessionWasClosedBySchedule && (! ["READY", "IN_PROGRESS"].includes(session.status) || !isSessionStartAvailable(session.date)))) {
    return NextResponse.json({ error: SESSION_NOT_STARTED_MESSAGE }, { status: 409 });
  }

  await persistAthleteProgress(payload, athlete.id, assignedBlocks);

  return NextResponse.json({ ok: true });
}

function isSessionFeedback(value: AthleteProgressPayload["sessionFeedback"]) {
  return (
    value === undefined ||
    ((typeof value.rating === "string" || value.rating === null) && (typeof value.note === "string" || value.note === null))
  );
}
