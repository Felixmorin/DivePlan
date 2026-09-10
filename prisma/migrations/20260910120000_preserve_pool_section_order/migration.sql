ALTER TABLE "PoolSection" ADD COLUMN "order" INTEGER;

WITH ordered_sections AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "poolTrainingId"
      ORDER BY "height", "id"
    ) - 1 AS "position"
  FROM "PoolSection"
)
UPDATE "PoolSection"
SET "order" = ordered_sections."position"
FROM ordered_sections
WHERE "PoolSection"."id" = ordered_sections."id";

ALTER TABLE "PoolSection" ALTER COLUMN "order" SET NOT NULL;
CREATE INDEX "PoolSection_poolTrainingId_order_idx" ON "PoolSection"("poolTrainingId", "order");
