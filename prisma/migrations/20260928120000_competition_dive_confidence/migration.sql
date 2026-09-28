ALTER TABLE "TrainingSession" ADD COLUMN "competitionEvaluationAtStart" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SessionBlock" ADD COLUMN "competitionEvaluation" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AthleteCompetitionDiveEvaluation" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "competitionDiveId" TEXT NOT NULL,
    "diveCode" TEXT NOT NULL,
    "height" "PoolHeight" NOT NULL,
    "rating" INTEGER NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AthleteCompetitionDiveEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AthleteCompDiveEval_athlete_session_dive_key" ON "AthleteCompetitionDiveEvaluation"("athleteId", "sessionId", "competitionDiveId");
CREATE INDEX "AthleteCompDiveEval_athlete_dive_time_idx" ON "AthleteCompetitionDiveEvaluation"("athleteId", "competitionDiveId", "evaluatedAt");
CREATE INDEX "AthleteCompDiveEval_session_idx" ON "AthleteCompetitionDiveEvaluation"("sessionId");

ALTER TABLE "AthleteCompetitionDiveEvaluation" ADD CONSTRAINT "AthleteCompetitionDiveEvaluation_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteCompetitionDiveEvaluation" ADD CONSTRAINT "AthleteCompetitionDiveEvaluation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
