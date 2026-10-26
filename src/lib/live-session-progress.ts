import "server-only";
import { query } from "@/lib/db";
import type { LiveProgress } from "@/lib/live-session";

export type LiveProgressReply = { etag: string; progress: LiveProgress | null };

/** Initial rendering still receives the complete, allowlisted progress. */
export async function getLiveSessionProgress(sessionId: string, clubId: string): Promise<LiveProgress | null> {
  return (await getLiveSessionProgressReply(sessionId, clubId))?.progress ?? null;
}

/** Authenticate in the caller; scope the read to the club before validating.
 * PostgreSQL still computes the snapshot, but unchanged logs never cross the
 * database connection. No stored version, extension or shared cache is needed.
 */
export async function getLiveSessionProgressReply(
  sessionId: string, clubId: string, validators: string[] = []
): Promise<LiveProgressReply | null> {
  const { rows } = await query<LiveProgressReply>(
    `WITH progress_data AS MATERIALIZED (
     SELECT s.status,
       md5(jsonb_build_object(
         'session', to_jsonb(s), 'groupName', g.name,
         'blocks', (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM "SessionBlock" b WHERE b."sessionId"=s.id),
         'assignments', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "SessionBlockAssignment" a JOIN "SessionBlock" b ON b.id=a."sessionBlockId" WHERE b."sessionId"=s.id),
         'exercises', (SELECT jsonb_agg(jsonb_build_object('item', to_jsonb(d), 'name', e.name) ORDER BY d."blockId", d."order", d."exerciseId") FROM "DrylandBlockExercise" d JOIN "SessionBlock" b ON b.id=d."blockId" JOIN "DrylandExercise" e ON e.id=d."exerciseId" WHERE b."sessionId"=s.id),
         'sections', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "PoolSection" p JOIN "SessionBlock" b ON b.id=p."poolTrainingId" WHERE b."sessionId"=s.id),
         'dives', (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM "PoolDive" d JOIN "PoolSection" p ON p.id=d."poolSectionId" JOIN "SessionBlock" b ON b.id=p."poolTrainingId" WHERE b."sessionId"=s.id)
       )::text) AS "planVersion",
       COALESCE((SELECT jsonb_agg(jsonb_build_object('athleteId', a."athleteId") ORDER BY a."athleteId") FROM "AthleteSessionAbsence" a WHERE a."sessionId"=s.id), '[]'::jsonb) AS absences,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('athleteId', l."athleteId", 'poolDiveId', l."poolDiveId", 'repetitionsCompleted', l."repetitionsCompleted") ORDER BY l."athleteId", l."poolDiveId") FROM "AthleteDiveLog" l WHERE l."sessionId"=s.id), '[]'::jsonb) AS "diveLogs",
       COALESCE((SELECT jsonb_agg(jsonb_build_object('athleteId', l."athleteId", 'exerciseId', l."exerciseId", 'completed', l.completed) ORDER BY l."athleteId", l."exerciseId") FROM "AthleteExerciseLog" l WHERE l."sessionId"=s.id), '[]'::jsonb) AS "exerciseLogs"
     FROM "TrainingSession" s
     JOIN "TrainingWeek" w ON w.id=s."weekId"
     JOIN "TrainingGroup" g ON g.id=w."groupId"
     WHERE s.id=$1 AND w."clubId"=$2 LIMIT 1
     ), tagged AS MATERIALIZED (
       SELECT to_jsonb(progress_data) AS progress,
         '"' || encode(sha256(convert_to(
           jsonb_build_array($2::text, $1::text, to_jsonb(progress_data))::text, 'UTF8'
         )), 'hex') || '"' AS etag
       FROM progress_data
     )
     SELECT etag, CASE WHEN etag=ANY($3::text[]) THEN NULL ELSE progress END AS progress
     FROM tagged`,
    [sessionId, clubId, validators]
  );
  return rows[0] ?? null;
}
