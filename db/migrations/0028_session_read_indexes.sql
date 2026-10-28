-- Bound the work of the frequent scheduler and paginated session reads.
CREATE INDEX IF NOT EXISTS "TrainingSession_due_date_idx" ON "TrainingSession" (date) WHERE status IN ('READY','IN_PROGRESS');
CREATE INDEX IF NOT EXISTS "TrainingSession_week_date_id_idx" ON "TrainingSession" ("weekId",date DESC,id DESC);
