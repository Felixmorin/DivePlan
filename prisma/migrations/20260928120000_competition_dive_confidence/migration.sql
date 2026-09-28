ALTER TABLE "TrainingSession" ADD COLUMN "competitionEvaluationAtStart" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SessionBlock" ADD COLUMN "competitionEvaluation" BOOLEAN NOT NULL DEFAULT false;
CREATE TYPE "CompetitionEvaluationAuthor" AS ENUM ('ATHLETE', 'COACH');

CREATE TABLE "AthleteCompetitionDiveEvaluation" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "sessionId" TEXT,
    "coachId" TEXT,
    "competitionDiveId" TEXT NOT NULL,
    "diveCode" TEXT NOT NULL,
    "height" "PoolHeight" NOT NULL,
    "rating" INTEGER NOT NULL,
    "evaluator" "CompetitionEvaluationAuthor" NOT NULL DEFAULT 'ATHLETE',
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AthleteCompetitionDiveEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AthleteCompDiveEval_athlete_session_dive_key" ON "AthleteCompetitionDiveEvaluation"("athleteId", "sessionId", "competitionDiveId");
CREATE INDEX "AthleteCompDiveEval_athlete_dive_time_idx" ON "AthleteCompetitionDiveEvaluation"("athleteId", "competitionDiveId", "evaluatedAt");
CREATE INDEX "AthleteCompDiveEval_session_idx" ON "AthleteCompetitionDiveEvaluation"("sessionId");
CREATE INDEX "AthleteCompDiveEval_subject_author_time_idx" ON "AthleteCompetitionDiveEvaluation"("athleteId", "evaluator", "evaluatedAt");

ALTER TABLE "AthleteCompetitionDiveEvaluation" ADD CONSTRAINT "AthleteCompetitionDiveEvaluation_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteCompetitionDiveEvaluation" ADD CONSTRAINT "AthleteCompetitionDiveEvaluation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteCompetitionDiveEvaluation" ADD CONSTRAINT "AthleteCompetitionDiveEvaluation_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE SET NULL ON UPDATE CASCADE;
