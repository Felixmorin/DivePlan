CREATE TABLE "PlanningEventPushDelivery" (
  "id" TEXT NOT NULL,
  "planningEventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  CONSTRAINT "PlanningEventPushDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlanningEventPushDelivery_status_check" CHECK ("status" IN ('PENDING', 'SENT', 'FAILED'))
);

CREATE UNIQUE INDEX "PlanningEventPushDelivery_planningEventId_userId_key" ON "PlanningEventPushDelivery"("planningEventId", "userId");
CREATE INDEX "PlanningEventPushDelivery_status_createdAt_idx" ON "PlanningEventPushDelivery"("status", "createdAt");
ALTER TABLE "PlanningEventPushDelivery" ADD CONSTRAINT "PlanningEventPushDelivery_planningEventId_fkey" FOREIGN KEY ("planningEventId") REFERENCES "PlanningEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanningEventPushDelivery" ADD CONSTRAINT "PlanningEventPushDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
