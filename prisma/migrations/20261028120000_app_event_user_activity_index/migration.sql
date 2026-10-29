-- Supports the latest-activity lookup for each user and the admin user history panel.
CREATE INDEX "AppEvent_userId_createdAt_idx" ON "AppEvent"("userId", "createdAt" DESC);
