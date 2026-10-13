ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE TABLE IF NOT EXISTS "SessionCancellationPushDelivery" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  CONSTRAINT "SessionCancellationPushDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionCancellationPushDelivery_status_check" CHECK ("status" IN ('PENDING', 'SENT', 'FAILED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "SessionCancellationPushDelivery_sessionId_userId_key" ON "SessionCancellationPushDelivery"("sessionId", "userId");
CREATE INDEX IF NOT EXISTS "SessionCancellationPushDelivery_status_createdAt_idx" ON "SessionCancellationPushDelivery"("status", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionCancellationPushDelivery_sessionId_fkey' AND conrelid = '"SessionCancellationPushDelivery"'::regclass) THEN
    ALTER TABLE "SessionCancellationPushDelivery" ADD CONSTRAINT "SessionCancellationPushDelivery_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionCancellationPushDelivery_userId_fkey' AND conrelid = '"SessionCancellationPushDelivery"'::regclass) THEN
    ALTER TABLE "SessionCancellationPushDelivery" ADD CONSTRAINT "SessionCancellationPushDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
