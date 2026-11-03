# Corriger les effectifs des séances dans le calendrier coach

## Preuve et changement

Base inspectée : branche par défaut `master`, commit
`141a5000ed1de4b7de12c65cc0b02f859c65b0ca`, le 2 novembre 2026.
La page `/coach/planning` transmet à sa requête d'affectations les identifiants
des séances sélectionnées, mais les compare à `SessionBlockAssignment.sessionBlockId`.
Les identifiants de blocs et de séances étant différents, des séances assignées
apparaissent avec zéro athlète sur les cartes hebdomadaires.

La requête joint désormais `SessionBlock` et filtre `SessionBlock.sessionId`.
Elle conserve ses deux colonnes utiles, les paramètres SQL et son exécution
dans le même `Promise.all`. Le jeu de séances parent reste filtré par club,
période et visibilité. Aucune mutation, migration, nouvelle dépendance ou
modification du design. Le dédoublonnage des athlètes entre blocs reste celui
de `uniqueAssignedIds` ; les affectations originales ne sont pas modifiées.

## Reproduction synthétique

Le test exécute la page réelle, ses requêtes dans PGlite et son rendu React,
avec authentification et composants périphériques simulés. La variante avant
rétablit uniquement l'ancienne requête d'affectations. Les données sont fictives.

Même séance : un bloc d'échauffement et un bloc piscine, deux athlètes dont un
présent dans les deux blocs, soit trois affectations.

| Observation | Avant | Après |
| --- | ---: | ---: |
| Effectif affiché sur la carte | 0 | 2 |
| Affectations chargées pour la séance | 0 | 3 |
| Lectures SQL de la page | 7 | 7 |

Pour ce scénario hebdomadaire, le rendu est identique après remplacement de
l'unique effectif erroné. Les volumes, ordre et types de blocs, états de séance
et de complétion, liens, événement lié masqué et camp autonome sont conservés.
Tests supplémentaires : vues semaine/mois, vrais blocs sans affectation, séance
sans bloc, période vide, séance cachée, séance hors période, autre club, coach
non autorisé, mode démo sans SQL et propagation d'une erreur de lecture.

Il s'agit d'une correction de fiabilité, pas d'une réduction d'egress : les
affectations nécessaires sont maintenant réellement chargées. Aucun temps ni
octet réseau avant/après n'a été mesuré. Le nombre de lectures ne renseigne
pas sur leur coût d'exécution.

## Observation de production et limites

Projet Vercel `dive-plan`, identifiant
`prj_P775WajMS3NIVzjDXawTdlRZ4CvT`, équipe
`team_lAR7ON9BjPKPDVdpEaMPmDjz` : correspondance revérifiée avec
Felixmorin/DivePlan et `dive-plan.vercel.app` avant les requêtes de diagnostic.
Dernière production READY : `dpl_5RBtzMvvQCqhJtETiJngK2Qou2kK`, commit
`141a500`. Aucun log error/fatal en production entre le 2026-11-02
21:14:40.290 et 22:04:40.290 UTC (16:14–17:04 à Toronto), ni erreur runtime
retournée sur les 50 dernières minutes. L'absence de logs ne prouve pas
l'absence d'incident ; la fréquence réelle de ce défaut n'est pas connue.

Schéma Vercel découvert avant requête ; la somme
`vercel.function_invocation.fot_out_bytes` a échoué HTTP 400. CLI Vercel absente.
Fast Origin Transfer CDN/compute, transferts navigateur, volume PostgreSQL
estimé, HTML/RSC/JSON et fichiers JavaScript sont des catégories distinctes :
aucun gain sur ces volumes ou sur la facture n'est déduit de ce scénario.

`/coach/observability` redirige vers `/coach` dans le code. L'instrumentation et
les agrégats ont été examinés par le code ; aucune page connectée ni donnée
d'athlète réelle n'a été consultée. Le tableau Performance courant présente
LCP/INP/CLS avec des effectifs et moyennes, sans distributions ; FCP/TTFB sont
collectés mais ne figurent pas dans cette vue. Aucune moyenne historique ne
permet d'attribuer le défaut d'effectif à un incident de performance.

## Validation et intégration

Les résultats finaux des tests locaux, TypeScript, lint, CI/build et preview
sont consignés dans la PR. Next.js installé et verrouillé : 16.4.3, instructions
AGENTS.md et documentation locale consultées. Le build local n'est pas relancé
après le refus automatique antérieur lié à Sentry ; le build habituel de CI
est une vérification distincte.

La PR de design #68 touche également cette page mais ne change pas la requête
d'affectations. Sa compatibilité doit être vérifiée et consignée avant que la
présente PR soit prête à réviser. #86 concerne le calendrier athlète, #87 les
sauvegardes et #88/#89 l'ingestion de télémétrie : aucun doublon.
Après un déploiement approuvé séparément, vérifier l'effectif d'une séance
assignée dans le calendrier coach, notamment sur mobile/iPad. Aucun parcours
connecté, déploiement ou changement de données en production effectué ici.
