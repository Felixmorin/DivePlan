CREATE TABLE "CompetitionDiveList" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitionDiveList_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompetitionDiveList_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CompetitionDiveList_athleteId_name_key" ON "CompetitionDiveList"("athleteId", "name");
CREATE INDEX "CompetitionDiveList_athleteId_position_idx" ON "CompetitionDiveList"("athleteId", "position");

INSERT INTO "CompetitionDiveList" ("id", "athleteId", "name", "position")
SELECT 'default-competition-list-' || a."id", a."id", 'Liste de compétition', 0
FROM "Athlete" a;

ALTER TABLE "CompetitionDive" ADD COLUMN "listId" TEXT;
UPDATE "CompetitionDive" d
SET "listId" = 'default-competition-list-' || d."athleteId";
ALTER TABLE "CompetitionDive" ALTER COLUMN "listId" SET NOT NULL;
ALTER TABLE "CompetitionDive"
  ADD CONSTRAINT "CompetitionDive_listId_fkey" FOREIGN KEY ("listId") REFERENCES "CompetitionDiveList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CompetitionDive_athleteId_listId_height_position_idx" ON "CompetitionDive"("athleteId", "listId", "height", "position");
