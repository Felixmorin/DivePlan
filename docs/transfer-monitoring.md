# Transfer monitoring

DivePlan includes lightweight browser-side transfer and performance monitoring for signed-in coaches and athletes.

The collector records same-origin browser resource timing by hourly bucket, page route, and resource type. Client-side navigation updates the page attribution. It also records LCP, INP, CLS, FCP, and TTFB using Next.js Web Vitals and sends the final values when a page is hidden or closed. INP uses the browser's interaction metric calculation rather than the longest raw event approximation. It stores hourly aggregates and performance quality counts without storing user IDs, email addresses, query strings, referrers, or full resource URLs. Dynamic path identifiers are normalized before storage. The request proxy passes the normalized page route to server-side SQL telemetry; SQL result bytes, query counts, and durations are grouped by that route. **Optimisation** reports SQL and HTTP totals by page; **Observabilité** shows transfer activity and Web Vitals.

## Enable it

1. If they have not already been applied, review and apply the required telemetry migrations, including `db/migrations/0023_database_egress_component.sql` and `db/migrations/0024_mark_unattributed_egress_history.sql`, to the intended PostgreSQL database. Migration files are applied explicitly; the application build does not run them.
2. Deploy the application code, or run it locally with a real club account and database.
3. For local collection in PowerShell, run `$env:NEXT_PUBLIC_ENABLE_LOCAL_TELEMETRY="true"` before `npm run dev`. Production collection is enabled automatically.
4. After signed-in users visit the app, open **Coach → Observabilité** to see the collected report.

## External production monitoring (Sentry)

The app also reports uncaught server and browser errors and sampled request/navigation performance to Sentry. Create a Sentry project for Next.js, then set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in the Vercel project environment variables (Production; add Preview only if desired). The public DSN is an ingest endpoint, not an authentication secret. If it is omitted, external reporting stays disabled. The SDK samples 10% of performance transactions and does not enable session replay.

Events are scrubbed before they leave the app: user and request objects, headers, cookies, breadcrumbs, and extra payloads are discarded; email-like strings, query strings, likely secrets, and dynamic path IDs are redacted. Source maps are not uploaded during builds. Keep application logs free of credentials because logs are outside this event filter. Review your Sentry retention and data location settings for your organization before enabling production collection.

Apply the required migrations before deploying the code: the collector and report use these tables.

## Measurement limits

- Browser Resource Timing measures transfers observed by the user's browser. It is a useful estimate of client-facing Fast Data Transfer, not a billing export.
- The collector cannot measure Fast Origin Transfer between Vercel's CDN and compute. That requires Vercel's platform metrics.
- Only same-origin resources are included; cross-origin storage and third-party resources are excluded.
- Browser cache hits are counted, while their transferred bytes remain zero.
- The client batches measurements at most once per minute and when the page is hidden or closed. The telemetry endpoint stores data only for authenticated, club-associated users; expired or missing sessions are silently discarded because collection is best effort.
- Web Vitals are reported once per page when it becomes hidden or closes. The INP value comes from Next.js Web Vitals. A browser that is closed abruptly may not send its final sample.
- Performance ratings use the standard good boundaries (LCP 2.5 s, INP 200 ms, CLS 0.1, FCP 1.8 s, TTFB 800 ms); poor begins above 4 s, 500 ms, 0.25, 3 s, and 1.8 s respectively. Observabilité shows the share of rated visits in each band. At least 10 rated visits are required before it creates a performance recommendation; 75% good visits is the reference target.
- Reports aggregate by club, hour, route, and resource type. No per-user history is retained.
- PostgreSQL result monitoring covers database queries made through the shared `query` helper and `withTransaction`. It sums the JSON-serialized size of rows returned to the app server and groups by club, route, component, and hour. Components include authentication, initial session loading, and other measured queries. Migration 0024 moves older unclassified rows to `historical_unclassified`; the optimization view excludes them from recent attributed totals and shows them separately. Unknown login identifiers cannot be assigned to a club and are omitted. This is a query-result-size estimate, not exact PostgreSQL wire/TLS traffic or provider-billed egress; protocol framing, compression, direct `PoolClient` use outside `withTransaction`, and other database traffic are not included. Small query bursts are aggregated before the telemetry write, which is excluded from the measured total.
- Per-page SQL attribution starts after deploying the proxy and application changes. Existing telemetry schema already stores the normalized route, so no additional database migration is needed. The aggregation is per page route and hour, not per individual visit or SQL statement.


## Admin request explorer (migration 0026)

In **Admin → Observabilité**, click a chart point (one absolute hour) or a route
(the selected period), or choose **Explorer les requêtes**. The explorer filters
by hour, originating page, resource type, trigger category and browser document.
It lists 50 observations at a time using a timestamp/UUID cursor and summarizes
resource destinations, HTTP status when available, browser duration, bytes and
minute counts for a selected hour. All displayed hours use America/Toronto,
including the daylight-saving abbreviation; URLs use absolute ISO timestamps.

### Deployment

1. Apply `db/migrations/0026_request_observations.sql` to the intended database
   **before** deploying this collector. No production migration is run by this PR.
2. Deploy the code. Keep `CRON_SECRET` configured for the existing cron jobs and
   the new `/api/cron/request-observations` job. Vercel runs the cleanup daily at
   01:00 UTC; it deletes up to 50,000 detail rows older than seven days per run.
   Hourly aggregates are preserved. If cleanup repeatedly reaches this limit,
   increase its frequency or run additional authenticated cleanups. Seven days
   is the target retention, not a guaranteed hard deletion deadline.
3. Visit a coach or athlete page with an authenticated, club-associated account.
   Wait up to one minute or hide the page, then inspect its route in the admin.
   Browser collection also supports club-associated admin accounts. Accounts
   without a club are still excluded by the existing ingestion authorization.
4. Verify that both detail and aggregate counts grow once, the page/destination
   differ as expected, and the cleanup endpoint rejects unauthenticated calls.
   If you roll back, deploy the old code first; the additive table can remain.

### Meaning and coverage

- These are **browser resource observations**, not server access logs or visits.
  The originating page and requested resource are separate fields. The UUID is
  an observation ID, not a distributed server/SQL trace ID. A random document
  ID lasts for one document load; it is not a user ID or an authenticated session.
- The collector attributes resources to the route active at their start time,
  rather than whichever route is active when a delayed response completes.
  New detail and hourly aggregates both use this start time. Legacy batches
  continue to use receipt time; old counts cannot be reconstructed individually.
- New batches contain observations only. A single SQL statement inserts new UUIDs
  and derives aggregate increments from inserted rows. Replayed UUIDs never
  increment totals twice. Existing aggregate-only and Web Vitals clients remain
  compatible during deployment.
- `navigation`, `reload`, and `back_forward` come from Navigation Timing. Static
  resources are labeled as page resources; `_rsc` identifies a Next.js data
  exchange. It **does not prove** a prefetch, click, polling loop or retry.
  Unidentified fetch causes remain unknown. SQL calls and user actions are not
  correlated individually in this implementation.
- Duration is browser resource duration, not server processing time. Status may
  be unavailable; zero/unsupported status is shown as unavailable. Cache hits
  remain a browser timing heuristic. Cross-origin resources, telemetry uploads,
  failed sends and requests the browser does not expose are not a complete log.
- Collection is best effort. At most 60 detailed observations are buffered per
  flush (normally once a minute); overflow remains in aggregate counters, with
  at most 40 page/type groups in memory. Detail batches contain at most 20 rows,
  with server validation capped at 40 rows / 20 KB. Query strings and fragments
  are never stored; known dynamic routes redact short IDs as well as long IDs,
  and upload/avatar paths are reduced to an asset placeholder. No headers,
  request/response bodies, referrers, names or email fields are collected.
- The explorer shows aggregate totals alongside available detail and explicitly
  identifies missing history, collection limits and retention. With detail
  filters enabled, its count describes the filtered subset, not the overall
  coverage. The observability page's own traffic is attributed to its route;
  drill-down links disable speculative Next.js prefetching.

### Validation

`node --import tsx --test src/**/*.test.ts` exercises the real ingestion,
explorer and cleanup SQL against PGlite (PostgreSQL), including authorization,
idempotency, receipt across an hour boundary, pagination ties, payload validation
and retention. The collector test checks delayed-resource page attribution,
URL redaction, bounded batches, overflow and self-collection exclusion.
