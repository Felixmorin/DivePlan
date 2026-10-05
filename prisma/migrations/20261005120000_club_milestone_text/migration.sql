CREATE TABLE "ClubMilestone" (
  "clubId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  CONSTRAINT "ClubMilestone_pkey" PRIMARY KEY ("clubId", "key"),
  CONSTRAINT "ClubMilestone_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
