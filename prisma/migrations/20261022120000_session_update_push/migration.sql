CREATE TABLE "SessionUpdatePushDelivery" (
  "id" TEXT NOT NULL,
  "updateId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  CONSTRAINT "SessionUpdatePushDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionUpdatePushDelivery_status_check" CHECK ("status" IN ('PENDING', 'SENT', 'FAILED'))
);
CREATE UNIQUE INDEX "SessionUpdatePushDelivery_updateId_userId_key" ON "SessionUpdatePushDelivery"("updateId", "userId");
CREATE INDEX "SessionUpdatePushDelivery_status_createdAt_idx" ON "SessionUpdatePushDelivery"("status", "createdAt");
ALTER TABLE "SessionUpdatePushDelivery" ADD CONSTRAINT "SessionUpdatePushDelivery_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionUpdatePushDelivery" ADD CONSTRAINT "SessionUpdatePushDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
