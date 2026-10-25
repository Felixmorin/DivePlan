ALTER TABLE "AiPrProposal"
  DROP CONSTRAINT "AiPrProposal_status_check";

ALTER TABLE "AiPrProposal"
  ADD CONSTRAINT "AiPrProposal_status_check"
  CHECK ("status" IN ('En attente d’approbation','À clarifier','À séparer','Approuvée','Refusée','Périmée','Fermée'));
