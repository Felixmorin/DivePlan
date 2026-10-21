CREATE TABLE "DatabaseEgressTelemetryHour" (
  "clubId" TEXT NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
  hour TIMESTAMPTZ NOT NULL,
  route TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  "resultBytes" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("clubId", hour, route)
);

CREATE INDEX "DatabaseEgressTelemetryHour_club_hour_idx" ON "DatabaseEgressTelemetryHour" ("clubId", hour DESC);
