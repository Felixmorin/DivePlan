ALTER TABLE "AthleteDiveLog" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "AthleteExerciseLog" ADD COLUMN "sessionId" TEXT;

UPDATE "AthleteDiveLog"
SET "sessionId" = "SessionBlock"."sessionId"
FROM "PoolDive"
JOIN "PoolSection" ON "PoolSection"."id" = "PoolDive"."poolSectionId"
JOIN "PoolTraining" ON "PoolTraining"."blockId" = "PoolSection"."poolTrainingId"
JOIN "SessionBlock" ON "SessionBlock"."id" = "PoolTraining"."blockId"
WHERE "AthleteDiveLog"."poolDiveId" = "PoolDive"."id";

UPDATE "AthleteExerciseLog"
SET "sessionId" = matched."sessionId"
FROM (
  SELECT DISTINCT ON ("DrylandBlockExercise"."exerciseId") "DrylandBlockExercise"."exerciseId", "SessionBlock"."sessionId"
  FROM "DrylandBlockExercise"
  JOIN "SessionBlock" ON "SessionBlock"."id" = "DrylandBlockExercise"."blockId"
  ORDER BY "DrylandBlockExercise"."exerciseId", "SessionBlock"."position"
) matched
WHERE "AthleteExerciseLog"."exerciseId" = matched."exerciseId";

ALTER TABLE "AthleteDiveLog" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "AthleteExerciseLog" ALTER COLUMN "sessionId" SET NOT NULL;

CREATE UNIQUE INDEX "AthleteDiveLog_athleteId_sessionId_poolDiveId_key" ON "AthleteDiveLog"("athleteId", "sessionId", "poolDiveId");
CREATE UNIQUE INDEX "AthleteExerciseLog_athleteId_sessionId_exerciseId_key" ON "AthleteExerciseLog"("athleteId", "sessionId", "exerciseId");

ALTER TABLE "AthleteDiveLog" ADD CONSTRAINT "AthleteDiveLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteExerciseLog" ADD CONSTRAINT "AthleteExerciseLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
