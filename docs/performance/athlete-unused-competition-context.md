# Omettre la liste de compétition quand le parcours ne la consomme pas

## Preuve et périmètre

Inspection du 3 novembre 2026 : branche par défaut `master`, commit
`5a7d771bd47c857ca4781d0410968270c7d17ad6`. `getCurrentAthlete` charge par
défaut les plongeons de la liste principale. Son option existante
`includeCompetitionDives: false` conserve le profil et ses contrôles d'accès
mais omet cette requête. Plusieurs appelants n'utilisaient pas encore l'option
alors qu'ils n'accèdent jamais à `competitionDives`.

Les sept pages suivantes et la sauvegarde d'un champ de profil utilisent
désormais cette option :

- Accueil `/athlete` ;
- progression et détail des plongeons ;
- historique `/athlete/week` ;
- préférences ;
- profil ;
- golden reps ;
- action `updateAthleteProfileField`.

Le chargeur, son contrat par défaut et son SQL ne changent pas. Compétition,
Badges et Édition du profil continuent à charger la liste : leurs calculs en
ont besoin. La liste n'est pas remplacée par un tableau vide ; la projection
sans liste l'omet, et TypeScript empêche ses nouveaux appelants d'y accéder.
Aucune migration, dépendance, modification de cache ou de règle métier.

## Mesure synthétique et régression

`node --import tsx --test src/lib/athlete-unused-competition-context.test.ts`

Le test exécute le vrai chargeur de contexte, ses SQL dans PGlite et les vraies
fonctions des sept pages. Les autres données de page sont synthétiques et leurs
chargeurs sont simulés ; composants UI importés contrôlés. Il compare le rendu
HTML statique et les identifiants transmis aux chargeurs, avant et après. Le
mode avant rétablit seulement l'appel sans option.

Même athlète fictif, groupe et coach, 12 plongeons dans sa liste principale,
une liste secondaire et un autre athlète/club. Une exécution par variante et
par page :

| Contexte `getCurrentAthlete` par appel | Avant | Après |
| --- | ---: | ---: |
| Lectures SQL | 3 | 2 |
| Plongeons inutiles chargés | 12 | 0 |
| Octets des résultats SQL en JSON | 2 492 | 901 |

Environ −63,8 % d'octets sur ce contexte synthétique uniquement. Authentification,
autres données de page, éventuelles lectures des composants imbriqués et
instrumentation sont exclues. Ce n'est pas le total d'une requête HTTP.
Un athlète sans groupe/coach n'a pas le même nombre de lectures de contexte.
Le gain réel dépend de la liste principale présente.

Les sept rendus contrôlés et les identifiants passés aux autres chargeurs sont
identiques. Pour la sauvegarde du prénom : 3 → 2 lectures de contexte, une
écriture avant comme après, mêmes invalidations et même utilisateur modifié.
Les tests vérifient validation du nom, nom d'utilisateur déjà utilisé, utilisateur
non connecté, mauvais rôle, mot de passe à définir, profil manquant, autre
athlète/club, et conservation du comportement complet par défaut (12 plongeons
propres à l'athlète, hors liste secondaire).

L'authentification connectée est simulée ; les gardes de rôle et de mot de passe
du chargeur et la validation Zod de l'action sont réelles. Pas de données
d'athlètes réels ni de modifications de production.

## Distinguer les volumes

Les octets sont `Buffer.byteLength(JSON.stringify(rows))`, une estimation du
volume PostgreSQL renvoyé, pas les octets du protocole PostgreSQL. La baisse
d'une lecture ne prouve pas une baisse de Fast Origin Transfer CDN/compute.
Les pages ne sérialisaient pas cette liste inutilisée vers leurs composants
clients : aucun gain de transferts navigateur, de HTML/RSC/JSON ou de taille
des fichiers JavaScript n'est revendiqué. Aucun temps SQL ou gain de latence
mesuré, aucune économie de facture extrapolée.

Projet Vercel `dive-plan`, projet `prj_P775WajMS3NIVzjDXawTdlRZ4CvT`, équipe
`team_lAR7ON9BjPKPDVdpEaMPmDjz` : correspondance revérifiée avec
Felixmorin/DivePlan et `dive-plan.vercel.app` avant diagnostic. Production READY
`dpl_Aczq2E5xy9n5kR2puQDKayGAYWcD`, commit `5a7d771`. Aucun log error/fatal
de production retourné entre le 2026-11-03 12:16:45.641 et 13:06:45.641 UTC
(07:16–08:06 Toronto, 50 minutes), ni erreur runtime retournée sur 50 minutes.
L'absence de logs ne prouve pas l'absence d'incident.

Schéma métrique découvert avant requête ; somme
`vercel.function_invocation.fot_out_bytes` échouée HTTP 400.
`/coach/observability` redirige vers `/coach` dans le code. Instrumentation et
vue Performance examinées par le code, aucune page connectée consultée.
Moyennes et effectifs LCP/INP/CLS disponibles dans le code de cette vue,
FCP/TTFB collectés mais non présentés ; aucune valeur réelle ni percentile
n'est déduit de ces seules définitions.

## Validation et intégration

AGENTS.md et documentation Next.js installé/verrouillé 16.4.3 lus, checklist
React réutilisée. Tests, TypeScript, lint ciblé, revue du diff, CI/build et preview :
résultats finaux consignés dans la PR. Build local non relancé après le refus
automatique antérieur lié à Sentry ; build normal de CI vérifié séparément.
Aucun parcours connecté mobile/iPad ou production testé.

Les PR #92/#93 concernent la bibliothèque coach, #68 le design coach : aucun
fichier commun ni dépendance. Cette correction étend l'option existante aux
autres appelants qui n'utilisent pas la liste, sans reproduire les corrections
des sauvegardes de progression. Aucune migration, fusion, auto-merge ou
promotion en production effectuée.

Après déploiement approuvé séparément, vérifier les parcours concernés et
comparer les octets SQL de contexte avec les traces existantes. Ces traces
doivent être distinguées de la requête HTTP complète, re-rendu compris. Le
défaut est établi sans nouvelle instrumentation ; aucune collecte ajoutée.
