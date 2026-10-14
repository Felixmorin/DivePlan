CREATE TABLE "CoachAthleteSessionNote" (
  "sessionId" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoachAthleteSessionNote_pkey" PRIMARY KEY ("sessionId", "athleteId"),
  CONSTRAINT "CoachAthleteSessionNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CoachAthleteSessionNote_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CoachAthleteSessionNote_athleteId_idx" ON "CoachAthleteSessionNote"("athleteId");
