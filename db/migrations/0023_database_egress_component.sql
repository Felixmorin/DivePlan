ALTER TABLE "DatabaseEgressTelemetryHour"
  ADD COLUMN component TEXT NOT NULL DEFAULT 'other';

ALTER TABLE "DatabaseEgressTelemetryHour"
  DROP CONSTRAINT "DatabaseEgressTelemetryHour_pkey",
  ADD CONSTRAINT "DatabaseEgressTelemetryHour_pkey"
    PRIMARY KEY ("clubId", hour, route, component);
