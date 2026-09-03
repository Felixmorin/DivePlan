CREATE TYPE "PlanningEventType" AS ENUM ('COMPETITION', 'CAMP', 'TRAINING_SCHEDULE');

CREATE TABLE "PlanningEvent" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "groupId" TEXT,
    "athleteId" TEXT,
    "type" "PlanningEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanningEvent_clubId_startsAt_idx" ON "PlanningEvent"("clubId", "startsAt");
CREATE INDEX "PlanningEvent_groupId_startsAt_idx" ON "PlanningEvent"("groupId", "startsAt");
CREATE INDEX "PlanningEvent_athleteId_startsAt_idx" ON "PlanningEvent"("athleteId", "startsAt");

ALTER TABLE "PlanningEvent" ADD CONSTRAINT "PlanningEvent_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanningEvent" ADD CONSTRAINT "PlanningEvent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TrainingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanningEvent" ADD CONSTRAINT "PlanningEvent_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE SET NULL ON UPDATE CASCADE;
