CREATE TABLE "AiAgent" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "mission" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "triggers" JSONB NOT NULL DEFAULT '{"onDemand":{"enabled":true},"schedule":{"enabled":false,"cron":"0 9 * * 1"},"afterDeploy":{"enabled":false},"incident":{"enabled":false}}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "AiAgentRun" (
  "id" TEXT PRIMARY KEY,
  "agentId" TEXT NOT NULL REFERENCES "AiAgent"("id") ON DELETE CASCADE,
  "trigger" TEXT NOT NULL CHECK ("trigger" IN ('on_demand','schedule','after_deploy','incident')),
  "status" TEXT NOT NULL CHECK ("status" IN ('pending','running','completed','failed')) DEFAULT 'pending',
  "startedAt" TIMESTAMPTZ,
  "finishedAt" TIMESTAMPTZ,
  "result" JSONB,
  "error" TEXT,
  "createdById" TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "AiAgentRun_status_createdAt_idx" ON "AiAgentRun" (status, "createdAt");
CREATE INDEX "AiAgentRun_agentId_createdAt_idx" ON "AiAgentRun" ("agentId", "createdAt" DESC);
CREATE UNIQUE INDEX "AiAgentRun_one_active_per_agent_idx" ON "AiAgentRun" ("agentId") WHERE status IN ('pending','running');

INSERT INTO "AiAgent" (id, name, mission, enabled)
VALUES (
  'diveplan-observability',
  'Observabilité DivePlan',
  'Détecter les régressions de performance, les erreurs récurrentes, les routes coûteuses et les problèmes de fiabilité; expliquer chaque constat avec les données disponibles; proposer des mesures et des correctifs prioritaires.',
  TRUE
)
ON CONFLICT (id) DO NOTHING;
