INSERT INTO "AiAgent" (id, name, mission, enabled, triggers)
VALUES (
  'architecture-cartographer',
  'Architecte-cartographe',
  'Cartographier en lecture seule les routes, modules, parcours, données, permissions et dépendances de DivePlan; distinguer les faits du code, les déductions et les vérifications manquantes; comparer chaque rapport à la cartographie précédente.',
  TRUE,
  '{"onDemand":{"enabled":true},"schedule":{"enabled":false,"cron":"0 9 * * 1"},"afterDeploy":{"enabled":false},"incident":{"enabled":false}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
