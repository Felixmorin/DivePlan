# Request fan-out and PostgreSQL transfer

## Changes

Authenticated coach, athlete and admin links use `AppLink`: Next.js client navigation is preserved, but speculative prefetch is disabled by default. An intentional exception can pass `prefetch={true}`. This changes navigation latency tradeoffs; it does not cache or share private data.

Coach profile sections are URL-backed (`?tab=overview|evaluations|competition|history`). Only the active section's data and client component tree are sent. The overview fetches seven recent wellness ratings instead of the complete session history and skips unused summary reads when generating charts. Returning to a section revalidates it; no cross-user cache is introduced.

Coach session lists, coach athlete history and athlete personal history use SQL pagination (25 rows, stable date/ID ordering), bounded page inputs and server-side filters. Totals and season training duration cover the full authorized dataset, not the displayed page. The next-session card remains available independently of the coach history page. Concurrent inserts may shift offset pages.

The library groups repeated dive tuples in SQL before transferring them. Profile counters and badges use a small summary query instead of the full chart loader. Agent status polling transfers at most 20 small status rows; report JSON is loaded once on a terminal transition, not on every poll. Polling stops while hidden, aborts on teardown and backs off on errors.

## Deployment prerequisites

1. Apply `0027_server_request_metrics.sql`, `0028_session_read_indexes.sql` and `0029_session_lifecycle_function.sql` after migration 0026 and before deploying the code. Take the usual backup; the new indexes can briefly lock writes while created. No production migration is executed by this PR.
2. In the Supabase SQL Editor, as the migration owner (`postgres`), execute `db/operations/enable-session-cron.sql`. This enables `pg_cron` and installs a named job that runs the lifecycle function every minute, entirely inside PostgreSQL, plus a daily cleanup of only these jobs’ execution history. Re-running the script with the same owner updates the named jobs. Confirm the next successful run in Supabase → Integrations → Cron → History before merging the application change. The native function is not callable by PUBLIC, anon, authenticated or service_role; it uses invoker permissions. Supabase documentation: https://supabase.com/docs/guides/cron/quickstart .
3. All schedules in `vercel.json` remain daily and compatible with Vercel Hobby. `/api/cron/complete-sessions` remains a daily fallback and health heartbeat, not the frequent scheduler. No Vercel upgrade is required by this change. Verify `CRON_SECRET` for the daily jobs. Do not deploy render-time mutation removal with only the daily fallback running.
4. The native tick is atomic, skips overlapping ticks and only completes newly expired sessions. It preserves existing completed data and applies the same 30-minute grace and absence rules as the server fallback. Transitions can lag by a scheduling interval and are best effort rather than exact-second guarantees. Explicit coach start actions still work. Supabase project suspension/paused compute prevents cron execution until it resumes.
5. Confirm the daily request-observation purge executes; it also removes server metrics older than seven days in bounded batches. The SQL setup separately retains seven days of the native jobs’ logs.

To verify the native job after setup:

```sql
SELECT j.jobname, r.status, r.start_time, r.end_time, r.return_message
FROM cron.job j JOIN cron.job_run_details r USING (jobid)
WHERE j.jobname = 'diveplan-session-lifecycle'
ORDER BY r.start_time DESC LIMIT 5;
```

To roll back the frequent schedule without touching other jobs, use `cron.unschedule('diveplan-session-lifecycle')` and `cron.unschedule('diveplan-session-cron-history-cleanup')`. Keep another frequent scheduler in place if the application still relies on automatic transitions; the daily Vercel job alone is insufficient for timely transitions.

## Measurement

The proxy overwrites telemetry context on protected and public auth routes, redacts known dynamic IDs and generates an opaque random request UUID. Request headers classify prefetch, navigation, action and API traffic; they do not establish the user's intent. A `Server-Timing` descriptor lets compatible same-origin Resource Timing observations reference that UUID.

The database wrapper accumulates query counts, errors, estimated result JSON bytes and cumulative query time for each request. It flushes one counter row using Next.js `after`, after the response finishes. It stores no SQL text, parameters, result bodies, raw dynamic IDs, IPs or user identity. Existing hourly aggregates remain separate. Telemetry calls and cron runs are excluded to avoid recursive monitoring. At most 1,024 spans are pending per process. Failures skip metrics rather than breaking page loads; this is not an exhaustive access log.

The admin request explorer displays server classification and SQL counters only when the UUID, club and destination route match. Unknown is not zero. Initial responses may arrive before their `after` write: refresh to see a late correlation. Browser caches can reference older UUIDs; repeated browser rows must not be summed as distinct SQL executions. Server-only requests without a received browser observation remain available in `ServerRequestMetric` but do not appear in the browser table.

Only queries through `query()` and `withTransaction()` are counted in per-request spans. Specialized raw/read-only diagnostic connections are outside that coverage. The SQL byte figure is `JSON.stringify(result.rows)` measured in the app: it excludes protocol/TLS overhead, may differ from PostgreSQL wire encoding, and is **not** Supabase billed egress. SQL duration is summed across queries and may exceed wall time when queries run concurrently.

For an absolute, non-destructive measurement window:

```sql
SELECT route, trigger, COUNT(*) AS measured_requests,
       SUM("queryCount") AS sql_queries,
       SUM("resultBytes") AS estimated_result_json_bytes,
       SUM("errorCount") AS sql_errors
FROM "ServerRequestMetric"
WHERE "startedAt" >= $1 AND "startedAt" < $2
GROUP BY route, trigger
ORDER BY SUM("resultBytes") DESC;
```

Repeat the same two-athlete/menu/section scenario with the same dataset and browser cache conditions before and after deployment. Compare HTTP request counts, **distinct server UUIDs**, SQL queries and estimated JSON bytes. Check provider egress separately over a representative interval. No production savings percentage is claimed by this PR.
