CREATE TABLE "TransferTelemetryHour" (
  "clubId" TEXT NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
  hour TIMESTAMPTZ NOT NULL,
  route TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  "transferBytes" BIGINT NOT NULL DEFAULT 0,
  "cacheHits" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("clubId", hour, route, "resourceType")
);

CREATE INDEX "TransferTelemetryHour_club_hour_idx" ON "TransferTelemetryHour" ("clubId", hour DESC);
