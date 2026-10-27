-- Browser observations, not a server access log. Apply before deploying the collector.
CREATE TABLE "RequestObservation" (
  id UUID PRIMARY KEY,
  "clubId" TEXT NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
  "pageId" UUID NOT NULL,
  route TEXT NOT NULL CHECK (length(route) <= 200),
  "resourcePath" TEXT NOT NULL CHECK (length("resourcePath") <= 200),
  "resourceType" TEXT NOT NULL,
  trigger TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ NOT NULL,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "durationMs" INTEGER NOT NULL CHECK ("durationMs" >= 0),
  "transferBytes" BIGINT NOT NULL CHECK ("transferBytes" >= 0),
  "cacheHit" BOOLEAN NOT NULL,
  status INTEGER
);
CREATE INDEX "RequestObservation_time_idx" ON "RequestObservation" ("startedAt" DESC, id DESC);
CREATE INDEX "RequestObservation_route_time_idx" ON "RequestObservation" (route, "startedAt" DESC, id DESC);
CREATE INDEX "RequestObservation_club_idx" ON "RequestObservation" ("clubId");
