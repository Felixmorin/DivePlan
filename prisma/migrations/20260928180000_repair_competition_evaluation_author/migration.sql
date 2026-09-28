DO $$
BEGIN
  CREATE TYPE "CompetitionEvaluationAuthor" AS ENUM ('ATHLETE', 'COACH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AthleteCompetitionDiveEvaluation"
ADD COLUMN IF NOT EXISTS "evaluator" "CompetitionEvaluationAuthor" NOT NULL DEFAULT 'ATHLETE';
