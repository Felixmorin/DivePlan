import { NextResponse } from "next/server";
import { getCurrentAthleteIdentity } from "@/lib/athlete-session";
import { getAssignedSessionBlocks, persistAthleteProgress, type AthleteProgressPayload } from "@/lib/athlete-progress";
import { query } from "@/lib/db";
import { isSessionStartAvailable, SESSION_NOT_STARTED_MESSAGE } from "@/lib/session-availability";

export async function POST(request: Request) {
  const athlete = await getCurrentAthleteIdentity();

  if (!athlete) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!isProgressPayload(payload)) {
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

// JSON is untrusted at this boundary. Reject malformed snapshots before any
// assignment/status reads or persistence; never silently coerce saved work.
function isProgressPayload(value: unknown): value is AthleteProgressPayload {
  if (!isRecord(value) || !isId(value.sessionId) || !Array.isArray(value.exercises) || !Array.isArray(value.dives)) return false;
  const feedback = value.sessionFeedback;
  if (feedback !== undefined && (!isRecord(feedback) || !isText(feedback.rating) || !isText(feedback.note))) return false;
  return value.exercises.every((item: unknown) => isRecord(item)
    && isId(item.exerciseId) && typeof item.completed === "boolean"
    && isText(item.rating) && isText(item.note))
    && value.dives.every((item: unknown) => isRecord(item)
      && isId(item.poolDiveId) && Number.isSafeInteger(item.repetitionsCompleted)
      && Number.isSafeInteger(item.goldenRepetitions) && typeof item.feedbackCompleted === "boolean"
      && isText(item.rating) && isText(item.note));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isText(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}
