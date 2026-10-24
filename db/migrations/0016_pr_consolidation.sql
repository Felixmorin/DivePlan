CREATE TABLE "AiPrProposal" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "sources" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'En attente d’approbation'
    CHECK ("status" IN ('En attente d’approbation','À clarifier','À séparer','Approuvée','Refusée','Périmée')),
  "history" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "AiPrProposal_status_updatedAt_idx" ON "AiPrProposal" ("status", "updatedAt" DESC);

INSERT INTO "AiAgent" (id, name, mission, enabled, triggers, "sortOrder")
VALUES (
  'pr-consolidation',
  'Agent de consolidation et de préparation des PR',
  'Rassembler les recommandations des agents d’analyse, en vérifier les preuves, repérer doublons, complémentarités, dépendances et conflits, puis préparer des propositions de PR traçables soumises à approbation humaine. Ne modifie jamais le code et ne crée ni branche ni PR/MR.',
  TRUE,
  '{"onDemand":{"enabled":true},"schedule":{"enabled":false,"cron":"0 9 * * 1"},"afterDeploy":{"enabled":false},"incident":{"enabled":false}}'::jsonb,
  (SELECT COALESCE(MAX("sortOrder"),-1)+1 FROM "AiAgent")
)
ON CONFLICT (id) DO NOTHING;
