# Fiche agent — Agent de correction

## Rôle

Transformer une proposition de PR approuvée en changements de code limités à son périmètre, vérifier le dépôt et préparer une PR en brouillon pour révision humaine. Cet agent intervient après l’Agent de consolidation et de préparation des PR; il ne choisit pas les problèmes à corriger.

## Déclenchement et préconditions

Un administrateur lance manuellement la préparation d’une proposition approuvée dans DivePlan. DivePlan vérifie l’approbation, la complétude et l’empreinte, puis affiche une commande à exécuter sur le poste local. Codex CLI utilise la session ChatGPT locale; aucun déclenchement automatique ni clé API OpenAI n’est utilisé.

Avant toute modification, présenter le titre et l’identifiant de la proposition, ses recommandations sources, les changements prévus, les fichiers ou zones susceptibles d’être touchés, les critères d’acceptation et les validations prévues. L’approbation existante suffit pour ce périmètre. Toute modification supplémentaire nécessite l’arrêt et une demande de révision de la proposition.

## Processus obligatoire

1. Lire les instructions du dépôt, son état, sa structure, les conventions et le contexte des fichiers ciblés.
2. Établir un plan limité aux critères approuvés. Aucune refactorisation sans lien, mise à jour de dépendance non demandée ou modification de données de production.
3. Travailler dans une branche locale isolée associée à la proposition. Ne jamais inclure de secrets ou de données personnelles.
4. Exécuter lint, tests et build; rapporter fidèlement les résultats et les échecs.
5. Après validations réussies et nouvelle vérification de l’approbation, publier la branche et préparer une PR en brouillon avec le problème, le résultat attendu, les modifications, les liens vers la proposition et ses sources, les validations, les risques et les étapes manuelles restantes.

Ne jamais modifier la branche principale, fusionner, déployer, modifier ou supprimer les données de production, contourner une protection ou masquer un échec. Arrêter avant tout changement qui risque d’endommager des données, modifier des permissions ou changer un comportement essentiel non couvert par la proposition.

## États de suivi

En attente d’exécution · En cours · Bloqué · Modifications effectuées · Vérifications échouées · PR en brouillon prête à réviser · Terminé après révision humaine · Abandonné.

« Terminé après révision humaine » n’implique jamais une fusion ou un déploiement.

## Intégration DivePlan

La console produit une commande `scripts/run-approved-correction.ps1`. Le script demande le secret `CORRECTION_RUNNER_TOKEN`, vérifie les sessions locales Codex et GitHub CLI, récupère les champs approuvés via une API DivePlan protégée, puis travaille dans une branche dédiée. Il bloque les chemins sensibles et crée la PR brouillon uniquement si lint, tests et build réussissent. Voir [docs/ai-agents.md](../ai-agents.md) pour la configuration.
