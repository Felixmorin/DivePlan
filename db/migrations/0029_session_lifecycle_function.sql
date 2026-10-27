-- Native, transactional lifecycle tick. Schedule as the migration owner, not via the public API.
-- Prisma timestamps are UTC timestamp-without-time-zone values.
CREATE OR REPLACE FUNCTION public.diveplan_sync_session_lifecycle(
  p_now timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC')
) RETURNS TABLE (started_count integer, completed_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  started_count := 0;
  completed_count := 0;
  -- Skip overlapping native ticks rather than building a queue of duplicate work.
  IF NOT pg_try_advisory_xact_lock(164731, 550029) THEN
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public."TrainingSession"
     SET status = 'IN_PROGRESS'
   WHERE status = 'READY' AND date <= p_now
     AND date + (duration + 30) * INTERVAL '1 minute' > p_now;
  GET DIAGNOSTICS started_count = ROW_COUNT;

  WITH closed AS (
    UPDATE public."TrainingSession"
       SET status = 'COMPLETED'
     WHERE status IN ('READY', 'IN_PROGRESS') AND date <= p_now
       AND date + (duration + 30) * INTERVAL '1 minute' <= p_now
    RETURNING id, date
  ), completions AS (
    INSERT INTO public."AthleteSessionCompletion"
      ("athleteId", "sessionId", "startedAt", "completedAt", status)
    SELECT DISTINCT a."athleteId", s.id, s.date,
      CASE WHEN absence."athleteId" IS NULL THEN p_now ELSE NULL::timestamp END,
      CASE WHEN absence."athleteId" IS NULL THEN 'COMPLETED'::public."CompletionStatus" ELSE 'SKIPPED'::public."CompletionStatus" END
    FROM closed s
    JOIN public."SessionBlock" b ON b."sessionId" = s.id
    JOIN public."SessionBlockAssignment" a ON a."sessionBlockId" = b.id
    LEFT JOIN public."AthleteSessionAbsence" absence
      ON absence."sessionId" = s.id AND absence."athleteId" = a."athleteId"
    ON CONFLICT ("athleteId", "sessionId") DO UPDATE SET
      "startedAt" = COALESCE("AthleteSessionCompletion"."startedAt", EXCLUDED."startedAt"),
      "completedAt" = EXCLUDED."completedAt",
      status = EXCLUDED.status
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO completed_count FROM closed;

  RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION public.diveplan_sync_session_lifecycle(timestamp without time zone) FROM PUBLIC;
-- Supabase may have explicit default function grants in addition to PUBLIC.
DO $permissions$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.diveplan_sync_session_lifecycle(timestamp without time zone) FROM %I', api_role);
    END IF;
  END LOOP;
END;
$permissions$;
