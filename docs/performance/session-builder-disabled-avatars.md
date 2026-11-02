# Ne pas charger les photos désactivées dans le constructeur de séances

## Défaut vérifiable et périmètre

Inspection du 2 novembre 2026, branche par défaut `master`, commit
`141a5000ed1de4b7de12c65cc0b02f859c65b0ca`. Les pages
`/coach/sessions/new` et `/coach/sessions/[id]/edit` sélectionnaient encore
`User.avatar` pour chaque athlète actif du club. Leur résolveur
`resolveAvatarUrls` remplace déjà toutes ces valeurs par `null` : les photos
sont désactivées et les interfaces affichent les initiales.

Les deux projections renvoient désormais `NULL::text AS avatar`. La forme
des données, les tris et les filtres sont conservés ; aucune photo stockée
n'est modifiée. Le résolveur existant reste en place. Aucun changement de
props du constructeur, de schéma, cache, dépendance, action ou règle métier.

La PR #82 fusionnée a traité l'annuaire et les groupes, pas ces deux pages.
La présente correction couvre le parcours de construction et d'édition,
avec des tests distincts. Les PR ouvertes #86 à #90 et #68 ne modifient pas
ces deux fichiers : pas de dépendance ou d'ordre de fusion imposé.

## Mesure synthétique reproductible

`node --import tsx --test src/lib/session-builder-avatar.test.ts`

Un club fictif de 30 athlètes actifs : 20 anciens avatars inline contenant
128 000 caractères de contenu chacun, 5 URL et 5 valeurs nulles. Autre club
et athlète inactif également présents. Une exécution par page et par variante.
Le mode avant rétablit uniquement la projection `u.avatar`.

| Parcours | Octets de résultats SQL en JSON avant | Après | Lectures directes avant/après |
| --- | ---: | ---: | ---: |
| Création avec template sélectionné | 2 565 721 | 5 186 | 8 / 8 |
| Édition d'un brouillon | 2 564 525 | 3 990 | 6 / 6 |

Environ 99,8 % de réduction sur ce seul jeu synthétique. La somme porte sur
les résultats des requêtes SQL directement exécutées par ces pages. Authentification,
chargement de séance/snapshots, insights piscine et instrumentation sont simulés
ou exclus de cette somme ; il ne s'agit donc pas du total SQL d'une requête HTTP.

PGlite exécute les vraies requêtes des pages, notamment les filtres par club
et activité et les moyennes SQL. Les fonctions réelles de conversion de templates
et le vrai résolveur d'avatar sont chargés. Les données de séance et insights
sont synthétiques ; les composants UI importés et le constructeur sont simulés.
Le constructeur rend ses props en JSON pour comparaison : le rendu contrôlé,
toutes ses props et toutes les données SQL hors champ avatar sont identiques.
Ce contrôle ne remplace pas un parcours navigateur connecté.

Les tests vérifient aussi les états DRAFT/READY, l'édition bloquée après démarrage,
les notes et choix initiaux, le template avec affectation et plongeon, les liens,
les clubs distincts, les athlètes inactifs, le club vide, l'accès refusé, la démo,
les erreurs SQL et la conservation des photos stockées. Les contrôles réels du
chargeur de séance restent couverts séparément par la suite existante.

## Nature du gain et limites des mesures

Les octets ci-dessus sont une estimation du volume PostgreSQL renvoyé, obtenue
par `Buffer.byteLength(JSON.stringify(rows))`, pas les octets du protocole
PostgreSQL. Le gain dépend des anciennes photos encore présentes en base.
Le nombre de requêtes est inchangé et ne prouve aucune réduction du temps SQL.

Fast Origin Transfer CDN/compute, transferts navigateur, taille HTML/RSC/JSON et
taille des fichiers JavaScript sont distincts de ce volume SQL. Les props client
étant déjà débarrassées des photos avant cette correction, aucun gain réseau
navigateur ou Fast Origin Transfer n'est revendiqué. Pas de mesure de latence
et aucune économie de facture garantie.

Projet Vercel `dive-plan`, identifiant `prj_P775WajMS3NIVzjDXawTdlRZ4CvT`,
équipe `team_lAR7ON9BjPKPDVdpEaMPmDjz` : correspondance revérifiée avec
Felixmorin/DivePlan et `dive-plan.vercel.app` avant diagnostics. Production READY
`dpl_5RBtzMvvQCqhJtETiJngK2Qou2kK`, commit `141a500`.
Aucun log error/fatal en production retourné entre le 2026-11-02 22:09:49.260
et 22:59:49.259 UTC (17:09–17:59 Toronto, environ 50 minutes), ni erreur runtime
retournée sur 50 minutes. L'absence de logs ne prouve pas l'absence d'incident.
Schéma métrique découvert avant requête ; la somme
`vercel.function_invocation.fot_out_bytes` échoue HTTP 400. Aucun chiffre de
transfert réel n'est déduit de cet échec.

`/coach/observability` redirige vers `/coach` dans le code. Instrumentation et
page Performance examinées par le code : moyennes et effectifs LCP/INP/CLS,
FCP/TTFB collectés mais absents de cette vue, sans distribution permettant des
percentiles. Aucune page connectée ni donnée réelle d'athlète consultée.

## Contrôles et suite

Next.js réellement installé/verrouillé : 16.4.3. AGENTS.md et documentation locale
lus ; checklist React appliquée aux deux pages. Résultats finaux des tests,
TypeScript, lint, CI/build et preview consignés dans la PR. Build local non
relancé après le refus automatique antérieur lié à Sentry ; build CI normal
vérifié séparément. Aucun parcours connecté mobile/iPad ou production testé.

Aucune migration ni étape spéciale de déploiement. Après un déploiement approuvé
séparément, comparer les octets SQL avec les traces existantes sur un club ayant
encore d'anciennes photos et vérifier les initiales ainsi que la création et
l'édition. Pas de nouvelle métrique nécessaire pour établir ce défaut ; mesurer
d'abord son impact réel avec l'instrumentation SQL existante.
