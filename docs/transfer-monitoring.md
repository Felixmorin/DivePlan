# Transfer monitoring

DivePlan includes lightweight browser-side transfer and performance monitoring for signed-in coaches and athletes.

The collector records same-origin browser resource timing by hourly bucket, route pattern, and resource type. It also records LCP, INP, CLS, FCP, and TTFB using Next.js Web Vitals and sends the final values when a page is hidden or closed. INP uses the browser's interaction metric calculation rather than the longest raw event approximation. It stores hourly aggregates and performance quality counts without storing user IDs, email addresses, query strings, referrers, or full resource URLs. Dynamic path identifiers are normalized before storage. **Monitoring** keeps the connection and activity logs; **Observabilité** shows consumption metrics and rules-based optimization suggestions for the last 24 hours.

## Enable it

1. If they have not already been applied, review and apply `db/migrations/0002_transfer_telemetry.sql`, `db/migrations/0003_performance_telemetry.sql`, `db/migrations/0004_performance_ratings.sql`, then `db/migrations/0005_database_egress_telemetry.sql` to the intended PostgreSQL database. Migration files are applied explicitly; the application build does not run them.
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
- The client batches measurements at most once per minute and when the page is hidden or closed. The telemetry endpoint requires an authenticated coach or athlete session.
- Web Vitals are reported once per page when it becomes hidden or closes. The INP value comes from Next.js Web Vitals. A browser that is closed abruptly may not send its final sample.
- Performance ratings use the standard good boundaries (LCP 2.5 s, INP 200 ms, CLS 0.1, FCP 1.8 s, TTFB 800 ms); poor begins above 4 s, 500 ms, 0.25, 3 s, and 1.8 s respectively. Observabilité shows the share of rated visits in each band. At least 10 rated visits are required before it creates a performance recommendation; 75% good visits is the reference target.
- Reports aggregate by club, hour, route, and resource type. No per-user history is retained.
- PostgreSQL result monitoring covers database queries made through the shared `query` helper and `withTransaction` across authenticated app requests. It sums the JSON-serialized size of rows returned to the app server and groups by club and hour. This is a useful query-result-size estimate, not exact PostgreSQL wire/TLS traffic or provider-billed egress; protocol framing, compression, direct `PoolClient` use outside `withTransaction`, and other database traffic are not included. Small query bursts are aggregated before the telemetry write, which is excluded from the measured total. Unauthenticated queries are not assigned to a club and are omitted.
