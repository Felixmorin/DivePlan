# Transfer monitoring

DivePlan includes lightweight browser-side transfer monitoring for production visits by signed-in coaches and athletes.

The collector records same-origin browser resource timing by hourly bucket, route pattern, and resource type. It stores total transfer bytes, request count, and browser-cache hits without storing user IDs, email addresses, query strings, referrers, or full resource URLs. Dynamic path identifiers are normalized before storage. The `/coach/monitoring` page shows the top routes and resource types from the last 24 hours.

## Enable it

1. Review and apply `db/migrations/0002_transfer_telemetry.sql` to the intended PostgreSQL database. Migration files are applied explicitly; the application build does not run them.
2. Deploy the application code.
3. After signed-in users visit the production app, open **Coach → Monitoring** to see the collected report.

Apply the migration before deploying the code: the collector and report both use the new table.

## Measurement limits

- Browser Resource Timing measures transfers observed by the user's browser. It is a useful estimate of client-facing Fast Data Transfer, not a billing export.
- The collector cannot measure Fast Origin Transfer between Vercel's CDN and compute. That requires Vercel's platform metrics.
- Only same-origin resources are included; cross-origin storage and third-party resources are excluded.
- Browser cache hits are counted, while their transferred bytes remain zero.
- The client batches measurements at most once per minute and when the page is hidden or closed. The telemetry endpoint requires an authenticated coach or athlete session.
- Reports aggregate by club, hour, route, and resource type. No per-user history is retained.
