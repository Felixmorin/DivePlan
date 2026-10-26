INSERT INTO "AiAgent" (id, name, mission, enabled, triggers, "sortOrder")
VALUES (
  'nextjs-code-analyst',
  'Analyse du code Next.js',
  'Utiliser Codex local en lecture seule pour analyser le code Next.js, repérer les pistes de coûts applicatifs, les fichiers possiblement inutilisés, les duplications et les améliorations de lisibilité. Exclure SQL, schémas, migrations et statistiques de base de données.',
  TRUE,
  '{"onDemand":{"enabled":true},"schedule":{"enabled":false,"cron":"0 9 * * 1"},"afterDeploy":{"enabled":false},"incident":{"enabled":false}}'::jsonb,
  (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "AiAgent")
)
ON CONFLICT (id) DO NOTHING;
