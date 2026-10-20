CREATE TYPE "CompetitionDiveStatus" AS ENUM ('READY', 'TO_WORK_ON', 'DIFFICULT', 'NOT_READY');

ALTER TABLE "CompetitionDive"
ADD COLUMN "status" "CompetitionDiveStatus" NOT NULL DEFAULT 'NOT_READY';
