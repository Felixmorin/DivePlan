ALTER TABLE "AiPrProposal"
  ADD COLUMN "correctionStatus" TEXT NOT NULL DEFAULT 'En attente d’exécution'
    CHECK ("correctionStatus" IN ('En attente d’exécution','En cours','Bloqué','Modifications effectuées','Vérifications échouées','PR en brouillon prête à réviser','Terminé après révision humaine','Abandonné')),
  ADD COLUMN "correctionExecutionId" TEXT,
  ADD COLUMN "correctionProposalHash" TEXT,
  ADD COLUMN "correctionRunUrl" TEXT,
  ADD COLUMN "correctionPullRequestUrl" TEXT;

CREATE INDEX "AiPrProposal_correctionStatus_updatedAt_idx"
  ON "AiPrProposal" ("correctionStatus", "updatedAt" DESC);
