CREATE TABLE "AthleteDiveNote" (
    "athleteId" TEXT NOT NULL,
    "poolDiveId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AthleteDiveNote_pkey" PRIMARY KEY ("athleteId", "poolDiveId"),
    CONSTRAINT "AthleteDiveNote_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AthleteDiveNote_poolDiveId_fkey" FOREIGN KEY ("poolDiveId") REFERENCES "PoolDive"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AthleteDiveNote_poolDiveId_idx" ON "AthleteDiveNote"("poolDiveId");
