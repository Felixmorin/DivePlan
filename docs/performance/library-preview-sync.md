# Synchroniser l'aperçu mobile avec les données actuelles de bibliothèque

## Défaut et comportement obtenu

Base inspectée le 3 novembre 2026 : branche par défaut `master`, commit
`5a7d771bd47c857ca4781d0410968270c7d17ad6`. Le composant de bibliothèque
conserve l'objet sélectionné dans son état local. Après une édition et l'arrivée
de nouvelles props serveur, la liste et le panneau desktop utilisent les données
actualisées, mais le panneau mobile utilisait encore cet ancien objet.

Le nom, les consignes, le dosage et les notes pouvaient donc rester périmés.
Le bouton Modifier réouvrait également un formulaire prérempli avec cet ancien
objet. Il s'agit d'un défaut reproduit dans le code, pas d'une perte de données
constatée en production.

L'aperçu résout désormais l'identifiant sélectionné dans la collection actuelle
`exercises`. Ses boutons Modifier et Supprimer reçoivent cette même version.
Si l'exercice a disparu de la collection, le panneau ne propose plus d'action
sur la sélection périmée. Le filtrage de la liste ne remplace pas la sélection
par un autre exercice : la recherche de l'aperçu utilise la collection complète.

Un formulaire déjà ouvert reste autonome : les changements de props ne remplacent
pas son brouillon non enregistré. Les styles, fermeture, navigation vers une
nouvelle séance, Server Actions, SQL et contrôles d'accès restent inchangés.
Aucun nouveau fetch, refresh, effet, cache, dépendance ou schéma.

## Reproduction synthétique

`node --import tsx --test src/lib/library-preview-sync.test.ts`

Le test charge le vrai composant et ses handlers. Il conserve l'état local entre
deux rendus avec des props synthétiques différentes. Les hooks et le routeur
sont simulés ; le vrai panneau d'aperçu est aussi rendu en HTML statique avec
des composants UI périphériques contrôlés. La variante avant rétablit seulement
l'usage de l'objet sélectionné dans le panneau et ses deux callbacks.

Même exercice, même identifiant, une mise à jour de props par variante :

| Observation après mise à jour | Avant | Après |
| --- | --- | --- |
| Consignes et notes dans l'aperçu | Ancienne version | Version actuelle |
| Objet transmis à une nouvelle édition | Ancienne version | Version actuelle |
| Sélection retirée de la collection | Ancien panneau conservé | Panneau absent |
| Appels supplémentaires de refresh et mutation | 0 | 0 |

Tests supplémentaires : nom actuel dans la confirmation de suppression,
conservation d'une saisie non enregistrée pendant une nouvelle mise à jour,
collection vide ou remplacée, changement de sélection, fermeture/réouverture,
mise à jour d'un autre exercice, filtre sans résultat et navigation avec le bon
identifiant. Aucune donnée réelle ni action de mutation exécutée par ce test.

Ce n'est pas un test de transport Next/RSC, d'authentification ou un parcours
connecté mobile/iPad. Les autorisations et mutations ne sont pas modifiées ;
leurs contrôles existants restent dans la suite complète et dans les tests de
la PR #92. Aucun gain de temps ou de transfert n'est déduit d'une correction
de synchronisation locale.

## État observé et catégories de mesure

Projet Vercel `dive-plan`, projet `prj_P775WajMS3NIVzjDXawTdlRZ4CvT`, équipe
`team_lAR7ON9BjPKPDVdpEaMPmDjz` : correspondance revérifiée avec
Felixmorin/DivePlan et `dive-plan.vercel.app` avant diagnostic. Dernière
production READY : `dpl_Aczq2E5xy9n5kR2puQDKayGAYWcD`, commit `5a7d771`.
Aucun log error/fatal en production retourné entre le 2026-11-03
11:17:28.310 et 12:07:28.310 UTC (06:17–07:07 Toronto, 50 minutes), ni erreur
runtime retournée sur 50 minutes. L'absence de logs ne prouve pas l'absence
d'incident. Fréquence réelle de ce défaut inconnue.

Schéma métrique découvert avant requête ; somme
`vercel.function_invocation.fot_out_bytes` échouée HTTP 400. Le test ne mesure
ni Fast Origin Transfer CDN/compute, ni transferts navigateur, ni volume
PostgreSQL estimé, ni tailles HTML/RSC/JSON ou fichiers JavaScript. Aucun gain
de facture ou de latence revendiqué.

`/coach/observability` redirige vers `/coach` dans le code. Instrumentation
examinée par le code, aucune page connectée consultée. La vue Performance
présente des moyennes et effectifs LCP/INP/CLS ; FCP/TTFB sont collectés mais
absents de cette vue. Aucune distribution accessible ne permet d'attribuer
des percentiles ou une évolution de Web Vitals à cette correction.

## Validation et intégration

AGENTS.md et documentation locale Next.js 16.4.3 lus. Tests, TypeScript, lint,
revue du diff, build CI et preview : résultats finaux consignés dans la PR.
Build local non relancé après le refus automatique antérieur lié à Sentry ;
build normal de CI vérifié séparément.

La PR #92 supprime des refresh redondants dans le même composant ; elle ne
corrige pas cette sélection périmée. Compatibilité de combinaison à vérifier
avant publication prête à réviser et à consigner dans la PR. Aucune dépendance
de fusion prévue. #68 ne touche pas ce fichier. Aucune migration ou étape
spéciale de déploiement, fusion, auto-merge ou promotion en production effectuée.

Après déploiement approuvé séparément, ouvrir un exercice sur mobile/iPad,
le modifier, puis vérifier l'aperçu et le préremplissage d'une nouvelle édition.
Les props suffisent à reproduire ce défaut ; aucune nouvelle collecte nécessaire
pour en établir la cause et aucune collecte nouvelle annoncée.
