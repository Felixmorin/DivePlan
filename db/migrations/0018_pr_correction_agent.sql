INSERT INTO "AiAgent" (id, name, mission, enabled, triggers, "sortOrder")
VALUES (
  'pr-correction',
  'Agent de correction',
  'Appliquer exclusivement les changements décrits dans une proposition de PR approuvée, vérifier le dépôt et préparer une PR en brouillon pour révision humaine. Ne choisit pas les problèmes, ne dépasse pas le périmètre, ne fusionne et ne déploie jamais.',
  TRUE,
  '{"onDemand":{"enabled":false},"schedule":{"enabled":false,"cron":"0 9 * * 1"},"afterDeploy":{"enabled":false},"incident":{"enabled":false},"afterApproval":{"enabled":false}}'::jsonb,
  (SELECT COALESCE(MAX("sortOrder"),-1)+1 FROM "AiAgent")
)
ON CONFLICT (id) DO NOTHING;
