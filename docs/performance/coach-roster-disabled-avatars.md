# Retirer les photos désactivées des résultats SQL des listes coach

Base : master `c84f571033ac5ee8996a92ce9c1b5e010600d0a1`.

## Problème et correction

Les photos de profil sont déjà désactivées : `resolveAvatarUrls` retourne toujours NULL et `avatarUrlForPage` également. L’annuaire athlètes, la liste des groupes et le détail d’un groupe chargeaient encore `User.avatar` en SQL avant de le remplacer par NULL pour afficher les initiales.

Les trois projections renvoient désormais NULL directement : `NULL::text AS avatar` pour les lignes plates, et `'avatar', NULL` dans le JSON des membres de groupes. Le champ reste présent pour conserver la forme des données. Les photos en base ne sont pas modifiées. Noms, niveaux, groupes, activité, présences/statuts et volumes, ainsi que les filtres/tri et règles d’accès, restent inchangés.

Cela concerne `/coach/athletes`, `/coach/groups` et `/coach/groups/:id`. Aucun fichier commun avec les PR ouvertes #68, #80 et #81 vérifiées; aucune dépendance de fusion. Cette correction étend l’exclusion des photos inutilisées à ces autres parcours; elle ne réplique pas la correction déjà fusionnée du contexte athlète (#70).

## Preuve synthétique

`node --import tsx --test src/lib/coach-roster-avatar.test.ts`

Le test exécute les vraies fonctions de pages et leurs vrais SQL dans PGlite. Même club de 30 athlètes : 20 anciens avatars inline de 128 000 caractères de contenu chacun, 5 URL et 5 valeurs NULL. Un autre club et un groupe vide contrôlent l’isolation et les états vides. Une exécution par page et par version. L’adaptateur rétablit seulement la projection d’avatar précédente pour le mode avant.

| Page — total des lignes SQL reçues représentées en JSON | Avant | Après | Lectures |
|---|---:|---:|---:|
| Annuaire athlètes | 2 573 542 octets | 13 007 octets | 5 → 5 |
| Liste des groupes | 2 567 996 octets | 7 461 octets | 2 → 2 |
| Détail du groupe | 2 568 410 octets | 7 875 octets | 1 → 1 |

Sur ce scénario seulement : réduction d’environ 99,5–99,7 %. Authentification et écritures d’instrumentation sont exclues des lectures comptées. Le gain réel dépend des anciens avatars présents; aucun volume réel de production n’est affirmé.

Le test compare toutes les données SQL hors seul champ avatar, puis le rendu serveur et les props des composants de liste dans un environnement UI contrôlé : HTML identique. Les fonctions de page, calculs locaux, icônes et résolveurs d’avatar sont réels; authentification et composants UI importés sont simulés, les props des listes étant rendues en JSON pour comparaison. Ce n’est pas un rendu visuel du produit complet ou un parcours navigateur connecté.

Les refus sans coach, la sélection par club, le groupe vide, le groupe d’un autre club, les noms/volumes/statuts et les contrôles de sélection passent par les mêmes pages et SQL. Avant correction, les trois tests échouent sur les photos inline encore présentes dans les résultats SQL.

Ce volume JSON estime les résultats PostgreSQL, hors protocole PostgreSQL/TLS. Le nombre de requêtes ne change pas. Les photos étaient déjà retirées avant le rendu client : aucune réduction HTML/RSC/JSON HTTP ou fichiers JS n’est revendiquée. Fast Origin Transfer CDN/compute, transferts navigateur et volume PostgreSQL sont des mesures distinctes. Aucun gain de latence ou de facture confirmé.

## Observabilité disponible et vérification après déploiement

Le 2 novembre 2026, projet/team/domaine dive-plan.vercel.app et lien Git Felixmorin/DivePlan reconfirmés via connecteurs. Production examinée READY `dpl_3VWNBj6wJzMnMQfK74j5N8znbxf5`, commit de base. Aucun log error/fatal sur **13:51:42–14:41:42 UTC (08:51:42–09:41:42 Montréal)** ni cluster d’erreur sur 50 minutes; l’absence de logs ne prouve pas l’absence d’incident.

Catalogue de métriques Vercel découvert avant interrogation; FOT sortant indisponible HTTP 400, CLI Vercel absente. `/coach/observability` redirige vers `/coach`. Instrumentation SQL/request et collecte Web Vitals existantes inspectées; aucune donnée privée connectée consultée. Les compteurs resultBytes existants suffisent pour vérifier ce gain après déploiement, sans nouvelle mesure ou collecte.

Après déploiement habituel, comparer les octets SQL sur un club ayant encore des anciens avatars et vérifier initiales, effectifs, volumes, états et accès sur les trois vues. Parcours connecté/mobile/iPad non testé ici. Aucune migration, dépendance, écriture de photos, fusion, auto-merge ou action production.
