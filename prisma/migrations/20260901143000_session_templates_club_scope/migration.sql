ALTER TABLE "SessionTemplate" ADD CONSTRAINT "SessionTemplate_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "SessionTemplate_clubId_favorite_name_idx" ON "SessionTemplate"("clubId", "favorite", "name");

CREATE INDEX "SessionTemplate_sessionId_idx" ON "SessionTemplate"("sessionId");
