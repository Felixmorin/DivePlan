ALTER TABLE "AiAgentRun"
  DROP CONSTRAINT "AiAgentRun_status_check";

ALTER TABLE "AiAgentRun"
  ADD CONSTRAINT "AiAgentRun_status_check"
  CHECK ("status" IN ('pending', 'running', 'completed', 'failed', 'cancelled'));
