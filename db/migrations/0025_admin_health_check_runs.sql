CREATE TABLE "AdminHealthCheckRun" (
  id TEXT PRIMARY KEY,
  "checkType" TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ok', 'warning', 'failed')),
  detail TEXT NOT NULL,
  "userId" TEXT,
  metadata JSONB,
  "checkedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ
);
CREATE INDEX "AdminHealthCheckRun_type_checked_idx" ON "AdminHealthCheckRun" ("checkType", "checkedAt" DESC);
CREATE INDEX "AdminHealthCheckRun_checked_idx" ON "AdminHealthCheckRun" ("checkedAt" DESC);
