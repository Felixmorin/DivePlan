CREATE TABLE "AthleteSessionAbsence" (
    "athleteId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AthleteSessionAbsence_pkey" PRIMARY KEY ("athleteId", "sessionId")
);

CREATE INDEX "AthleteSessionAbsence_sessionId_idx" ON "AthleteSessionAbsence"("sessionId");

ALTER TABLE "AthleteSessionAbsence" ADD CONSTRAINT "AthleteSessionAbsence_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteSessionAbsence" ADD CONSTRAINT "AthleteSessionAbsence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
