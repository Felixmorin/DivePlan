ALTER TABLE "AiPrProposal"
  DROP CONSTRAINT "AiPrProposal_correctionStatus_check",
  ADD CONSTRAINT "AiPrProposal_correctionStatus_check"
    CHECK ("correctionStatus" IN ('En attente d’exécution','En cours','Bloqué','Modifications effectuées','Vérifications échouées','PR en brouillon prête à réviser','Terminé sans modification','Terminé après révision humaine','Abandonné'));
