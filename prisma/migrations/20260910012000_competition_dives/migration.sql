-- CreateTable
CREATE TABLE "CompetitionDive" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "height" "PoolHeight" NOT NULL,
    "diveCode" TEXT NOT NULL,
    "diveName" TEXT NOT NULL,
    "difficulty" DOUBLE PRECISION,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionDive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionDive_athleteId_height_position_idx" ON "CompetitionDive"("athleteId", "height", "position");

-- AddForeignKey
ALTER TABLE "CompetitionDive" ADD CONSTRAINT "CompetitionDive_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
