CREATE TABLE "CoachFeatureAccess" (
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "featureId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "featureId")
);

CREATE INDEX "CoachFeatureAccess_featureId_idx" ON "CoachFeatureAccess"("featureId");
