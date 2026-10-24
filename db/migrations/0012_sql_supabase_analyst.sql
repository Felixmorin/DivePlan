ALTER TABLE "AiAgentRun"
  ADD COLUMN "analysisPeriod" TEXT NOT NULL DEFAULT '7d'
  CHECK ("analysisPeriod" IN ('24h', '7d'));

INSERT INTO "AiAgent" (id, name, mission, enabled, triggers)
VALUES (
  'sql-supabase-analyst',
  'Analyste SQL & Supabase',
  'Analyser le SQL, les accès PostgreSQL/Supabase, le chargement des séances et la télémétrie disponible afin de repérer les risques de volume, de répétition et d’egress, puis proposer des améliorations vérifiables sans modifier la production.',
  TRUE,
  '{"onDemand":{"enabled":true},"schedule":{"enabled":false,"cron":"0 9 * * 1"},"afterDeploy":{"enabled":false},"incident":{"enabled":false}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
