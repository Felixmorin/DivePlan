CREATE TABLE "AthleteMilestone" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AthleteMilestone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AthleteMilestone_athleteId_key_key" ON "AthleteMilestone"("athleteId", "key");
CREATE INDEX "AthleteMilestone_key_awardedAt_idx" ON "AthleteMilestone"("key", "awardedAt");
ALTER TABLE "AthleteMilestone" ADD CONSTRAINT "AthleteMilestone_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
