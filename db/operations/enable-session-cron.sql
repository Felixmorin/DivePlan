-- Run once in Supabase SQL Editor as postgres AFTER migrations 0027–0029.
-- Re-running with the same owner and job names updates the jobs in place.
-- No HTTP call, Vercel function invocation, API key or external scheduler is used.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
  'diveplan-session-lifecycle',
  '* * * * *',
  $job$SELECT * FROM public.diveplan_sync_session_lifecycle();$job$
);

-- pg_cron does not prune its execution history automatically. Keep our jobs' last seven days.
SELECT cron.schedule(
  'diveplan-session-cron-history-cleanup',
  '15 1 * * *',
  $job$
    DELETE FROM cron.job_run_details
    WHERE jobid IN (
      SELECT jobid FROM cron.job
      WHERE jobname IN ('diveplan-session-lifecycle', 'diveplan-session-cron-history-cleanup')
    ) AND end_time < now() - INTERVAL '7 days';
  $job$
);

-- Confirm active schedules. Inspect History in Supabase Cron after the next minute.
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN ('diveplan-session-lifecycle', 'diveplan-session-cron-history-cleanup');
