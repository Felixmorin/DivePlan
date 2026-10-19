CREATE TABLE "PerformanceTelemetryHour" (
  "clubId" TEXT NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
  hour TIMESTAMPTZ NOT NULL,
  route TEXT NOT NULL,
  metric TEXT NOT NULL,
  samples INTEGER NOT NULL DEFAULT 0,
  "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "maxValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("clubId", hour, route, metric)
);

CREATE INDEX "PerformanceTelemetryHour_club_hour_idx" ON "PerformanceTelemetryHour" ("clubId", hour DESC);