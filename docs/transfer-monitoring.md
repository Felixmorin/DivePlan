# Transfer monitoring

DivePlan includes lightweight browser-side transfer and performance monitoring for signed-in coaches and athletes.

The collector records same-origin browser resource timing by hourly bucket, route pattern, and resource type. It also records LCP, INP, CLS, FCP, and TTFB when a page is hidden or closed. It stores aggregate transfer counts and performance samples without storing user IDs, email addresses, query strings, referrers, or full resource URLs. Dynamic path identifiers are normalized before storage. **Monitoring** keeps the connection and activity logs; **Observabilité** shows consumption metrics and rules-based optimization suggestions for the last 24 hours.

## Enable it

1. If it has not already been applied, review and apply `db/migrations/0002_transfer_telemetry.sql`, then apply `db/migrations/0003_performance_telemetry.sql` to the intended PostgreSQL database. Migration files are applied explicitly; the application build does not run them.
2. Deploy the application code, or run it locally with a real club account and database.
3. For local collection in PowerShell, run `$env:NEXT_PUBLIC_ENABLE_LOCAL_TELEMETRY="true"` before `npm run dev`. Production collection is enabled automatically.
4. After signed-in users visit the app, open **Coach → Observabilité** to see the collected report.

Apply the required migrations before deploying the code: the collector and report use these tables.

## Measurement limits

- Browser Resource Timing measures transfers observed by the user's browser. It is a useful estimate of client-facing Fast Data Transfer, not a billing export.
- The collector cannot measure Fast Origin Transfer between Vercel's CDN and compute. That requires Vercel's platform metrics.
- Only same-origin resources are included; cross-origin storage and third-party resources are excluded.
- Browser cache hits are counted, while their transferred bytes remain zero.
- The client batches measurements at most once per minute and when the page is hidden or closed. The telemetry endpoint requires an authenticated coach or athlete session.
- Web Vitals are reported once per page when it becomes hidden or closes. CLS uses the largest layout-shift session window seen on that page; INP is approximated by the longest supported event duration. A browser that is closed abruptly may not send its final sample.
- Reports aggregate by club, hour, route, and resource type. No per-user history is retained.
