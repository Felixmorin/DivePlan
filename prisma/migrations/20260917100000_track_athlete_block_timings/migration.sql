CREATE TABLE "AthleteBlockTiming" (
    "athleteId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "AthleteBlockTiming_pkey" PRIMARY KEY ("athleteId", "blockId"),
    CONSTRAINT "AthleteBlockTiming_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AthleteBlockTiming_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "SessionBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AthleteBlockTiming_blockId_openedAt_idx" ON "AthleteBlockTiming"("blockId", "openedAt");
