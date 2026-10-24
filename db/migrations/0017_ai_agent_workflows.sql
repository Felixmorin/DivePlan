ALTER TABLE "AiAgentRun"
  ADD COLUMN "workflowId" TEXT,
  ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "AiAgentRun_workflow_sequence_idx" ON "AiAgentRun" ("workflowId", sequence) WHERE "workflowId" IS NOT NULL;
