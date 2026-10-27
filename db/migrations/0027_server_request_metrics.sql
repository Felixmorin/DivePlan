-- Apply before deployment. Counters only: no SQL text, parameters or response bodies.
CREATE TABLE "ServerRequestMetric" (
  id UUID PRIMARY KEY,
  "clubId" TEXT REFERENCES "Club"(id) ON DELETE CASCADE,
  route TEXT NOT NULL CHECK (length(route)<=200),
  trigger TEXT NOT NULL CHECK (trigger IN ('prefetch','navigation','action','api','unknown')),
  "startedAt" TIMESTAMPTZ NOT NULL,
  "queryCount" INTEGER NOT NULL CHECK ("queryCount">=0),
  "resultBytes" BIGINT NOT NULL CHECK ("resultBytes">=0),
  "sqlDurationMs" BIGINT NOT NULL CHECK ("sqlDurationMs">=0),
  "errorCount" INTEGER NOT NULL CHECK ("errorCount">=0)
);
-- Read and write through the trusted server connection only; no browser policies.
ALTER TABLE "ServerRequestMetric" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "ServerRequestMetric_time_idx" ON "ServerRequestMetric" ("startedAt" DESC,id DESC);
ALTER TABLE "RequestObservation" ADD COLUMN "serverRequestId" UUID;
-- No foreign key: browser delivery can precede the after-response server write.
CREATE INDEX "RequestObservation_server_idx" ON "RequestObservation" ("serverRequestId") WHERE "serverRequestId" IS NOT NULL;
