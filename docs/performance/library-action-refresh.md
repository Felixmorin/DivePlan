# Éviter le second rafraîchissement des mutations de bibliothèque

## Défaut et correction

Base inspectée : branche par défaut `master`, commit
`5a7d771bd47c857ca4781d0410968270c7d17ad6`, le 2 novembre 2026.
Dans `/coach/library`, les favoris, l'archivage et le callback commun de
création/édition appelaient `router.refresh()` après la réussite de l'action.
Les trois Server Actions revalident déjà `/coach/library` avant de répondre.

La documentation de Next.js installé/verrouillé 16.4.3 indique qu'une Server
Action avec revalidation immédiate renvoie les données et l'UI actualisée
dans la même réponse Flight. Guides locaux consultés avant modification :
`node_modules/next/dist/docs/01-app/02-guides/server-actions.md` et
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`.
Le second rafraîchissement explicite demande donc un autre rendu inutile.

Les trois appels sont supprimés. Les transitions, notifications, fermetures de
formulaire/dialogue, boutons désactivés et invalidations serveur sont conservés.
Les navigations de l'aperçu « Ajouter à la séance » et des templates utilisent
toujours leur propre routeur. Aucun changement de Server Action, SQL, schéma,
cache ou autorisation ; les exercices restent dans le catalogue partagé existant.
La PR #80 traitait le formulaire d'actions des séances, pas cette bibliothèque.

## Reproduction synthétique

`node --import tsx --test src/lib/library-action-refresh.test.ts`

Le test charge le vrai composant et ses handlers ainsi que les vraies Server
Actions et leur validation Zod ; les écritures s'exécutent dans PGlite. Les
hooks React, le routeur, `revalidatePath` et l'authentification sont simulés.
La variante avant rétablit uniquement le routeur parent et les trois refresh.
Une exécution par variante et par opération, avec le même exercice fictif.

| Opération réussie | Appels explicites `router.refresh()` avant/après | Écritures SQL avant/après | Invalidations `/coach/library` avant/après |
| --- | ---: | ---: | ---: |
| Favori | 1 / 0 | 1 / 1 | 1 / 1 |
| Création | 1 / 0 | 1 / 1 | 1 / 1 |
| Édition | 1 / 0 | 1 / 1 | 1 / 1 |
| Archivage | 1 / 0 | 1 / 1 | 1 / 1 |

Résultats stockés, invalidations et notifications identiques. Les tests
contrôlent aussi les refus d'autorisation et erreurs SQL (pas de succès ni
refresh, formulaire conservé en cas d'échec), les boutons en attente et les
liens de navigation. Un marqueur synthétique de travail historique reste intact.
Les actions de bibliothèque ne modifient ni répétitions, golden reps ou présences.

Les props d'exercices sont relues depuis la base synthétique après l'action pour
vérifier le composant avec les données actualisées. Cela ne simule pas le
transport Flight ou le dispatcher Next complet. Ce test mesure des appels de
fonctions, pas les requêtes HTTP effectivement observées dans un navigateur.

## Observation et limites

Projet Vercel `dive-plan`, projet `prj_P775WajMS3NIVzjDXawTdlRZ4CvT`, équipe
`team_lAR7ON9BjPKPDVdpEaMPmDjz` : correspondance revérifiée avec le dépôt
Felixmorin/DivePlan et `dive-plan.vercel.app` avant le diagnostic. Dernière
production READY : `dpl_Aczq2E5xy9n5kR2puQDKayGAYWcD`, commit `5a7d771`.
Aucun log error/fatal retourné en production entre le 2 novembre 2026
23:14:25.857 UTC et le 3 novembre 00:04:25.856 UTC (18:14–19:04 le 2 novembre
à Toronto, environ 50 minutes), ni erreur runtime retournée sur 50 minutes.
L'absence de logs ne prouve pas l'absence d'incident. Aucun incident confirmé
à l'origine de cette correction.

Schéma métrique découvert avant requête ; la somme
`vercel.function_invocation.fot_out_bytes` échoue HTTP 400. `/coach/observability`
redirige vers `/coach` dans le code actuel. Instrumentation examinée par le code,
aucune page connectée ni donnée réelle consultée. Les agrégats Web Vitals
LCP/INP/CLS sont des moyennes avec effectifs ; FCP/TTFB sont collectés mais
absents de la vue Performance courante. Aucune distribution accessible ne
permet ici d'attribuer un gain de percentile à la correction.

Fast Origin Transfer CDN/compute, transferts navigateur, estimation du volume
PostgreSQL, tailles HTML/RSC/JSON et fichiers JavaScript sont des mesures
distinctes. Aucune de ces tailles ni durée avant/après n'est mesurée par le
scénario. Le nombre d'écritures SQL conservé ne prouve aucun gain de transfert.
Pas d'économie de facture garantie ni de latence extrapolée.

## Validation et intégration

Tests, TypeScript, lint ciblé, revue du diff, CI/build normal et preview :
résultats finaux consignés dans la PR. Le build local n'est pas relancé après le
refus automatique antérieur lié à Sentry ; le build CI est une vérification
distincte. Aucun parcours connecté mobile/iPad ou en production testé.

Aucun fichier commun avec la PR #68 encore ouverte, aucune dépendance ni
migration. Aucune fusion, auto-merge ou promotion en production effectuée.
Après déploiement approuvé séparément, vérifier les quatre mutations et comparer
les appels RSC réellement émis avec l'instrumentation de requêtes existante avant
d'ajouter une mesure. Aucune nouvelle collecte annoncée.
