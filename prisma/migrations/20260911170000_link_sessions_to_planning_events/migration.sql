ALTER TABLE "TrainingSession" ADD COLUMN "planningEventId" TEXT;

CREATE UNIQUE INDEX "TrainingSession_planningEventId_key" ON "TrainingSession"("planningEventId");

ALTER TABLE "TrainingSession"
ADD CONSTRAINT "TrainingSession_planningEventId_fkey"
FOREIGN KEY ("planningEventId") REFERENCES "PlanningEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
