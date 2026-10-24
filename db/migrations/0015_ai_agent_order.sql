ALTER TABLE "AiAgent" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) - 1 AS position
  FROM "AiAgent"
)
UPDATE "AiAgent" AS agent
SET "sortOrder" = ranked.position
FROM ranked
WHERE agent.id = ranked.id;

CREATE INDEX "AiAgent_sortOrder_idx" ON "AiAgent" ("sortOrder", "createdAt");
