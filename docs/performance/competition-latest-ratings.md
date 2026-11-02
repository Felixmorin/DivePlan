# Dernières notes de compétition sans charger tout l’historique

Base : master `c84f571033ac5ee8996a92ce9c1b5e010600d0a1`.

## Lecture inutile et correction

La page coach `/coach/athletes/:id?tab=competition` chargeait toutes les évaluations ATHLETE et COACH de l’athlète. Son tableau ne consomme que la dernière note ATHLETE de chaque plongeon actuel, calculée ensuite dans le composant serveur. L’historique était transféré depuis PostgreSQL sans être affiché sur cet onglet.

`getCompetitionConfidence` propose deux modes explicites :
- `latest-athlete` pour le seul onglet Compétition : DISTINCT ON par plongeon, évaluations ATHLETE, jointure sur les plongeons actuels du même athlète. Toutes les listes actuelles restent couvertes, y compris les secondaires; plongeons supprimés, notes coach et anciennes notes sont exclus de cette réponse.
- `history` pour l’aperçu et l’onglet Évaluations : même requête historique et même ordre qu’avant, sans limitation des données de graphique. L’onglet Historique ne lance toujours aucune lecture d’évaluation.

La page autorise l’athlète par club avant cet appel; le chargeur ne crée aucun cache partagé. Les erreurs de schéma manquant remontent au bloc existant qui affiche l’indisponibilité des évaluations. Les autres erreurs continuent de remonter. Aucun changement d’interface ou d’écriture métier.

En cas d’horodatages exactement égaux, l’identifiant d’évaluation décroissant tranche désormais de façon stable dans le mode réduit. Le choix précédent entre deux notes de même date n’était pas défini par le SQL. Le mode historique reste strictement inchangé.

## Preuve synthétique reproductible

`node --import tsx --test src/lib/competition-confidence.test.ts`

PGlite, vrais SQL, mêmes données : 12 plongeons répartis entre listes active et secondaire, 100 évaluations ATHLETE et 100 COACH par plongeon, plus une ancienne évaluation de plongeon supprimé et une référence historique incohérente. Un autre athlète sert à contrôler l’isolation. Une comparaison par mode :

| Lecture d’évaluations seulement | Avant, historique complet | Après, dernières notes |
|---|---:|---:|
| SELECT | 1 | 1 |
| Lignes retournées | 2 402 | 12 |
| Octets des résultats SQL représentés en JSON | 344 100 | 1 732 |

Réduction synthétique de **99,5 %** des octets JSON de cette seule lecture. La fixture ne représente pas un volume de production observé. Le SQL lit toujours l’historique nécessaire pour déterminer la dernière note; son coût CPU/temps n’a pas été mesuré et aucune réduction n’est revendiquée.

Pour chaque plongeon retourné, le test compare la ligne à la dernière note ATHLETE obtenue par l’ancien filtrage/tri JavaScript. Il vérifie listes secondaires, plongeon sans note, identité distincte, référence à un plongeon d’un autre athlète, athlète sans données, égalité d’horodatage, ordre historique inchangé et propagation d’une table manquante.

Un second test exécute la vraie fonction de page extraite par AST avec des dépendances contrôlées : mode par onglet, historique de graphique conservé, absence de lecture sur l’onglet Historique, refus hors club/sans autorisation, avertissement pour 42P01/42703 et propagation des autres erreurs. Le contrôle SQL de profil est simulé dans ce test de page; les vrais SQL d’évaluations sont vérifiés séparément.

La taille mesurée exclut protocole PostgreSQL/TLS et les autres lectures de la page. Les props du tableau client contiennent déjà une seule note par plongeon et restent identiques; aucune réduction HTML/RSC/JSON HTTP ou JavaScript n’est annoncée. Fast Origin Transfer CDN/compute, transferts navigateur, volume PostgreSQL estimé, réponses HTTP et fichiers JS sont distincts. Aucun gain de facture ou de latence revendiqué.

## Observabilité et déploiement

Le 2 novembre 2026, projet/team/domaine dive-plan.vercel.app et lien Git Felixmorin/DivePlan reconfirmés via connecteurs. Production examinée READY `dpl_3VWNBj6wJzMnMQfK74j5N8znbxf5`, commit de base. Aucun log error/fatal sur **12:06:28–12:56:28 UTC (07:06:28–07:56:28 Montréal)** ni cluster d’erreur sur 50 minutes; cela ne prouve pas l’absence d’incident ni l’utilisation de ce parcours.

Catalogue de métriques découvert avant interrogation; FOT sortant indisponible HTTP 400, CLI Vercel absente. `/coach/observability` redirige vers `/coach`. Instrumentation SQL/request et collecteur Web Vitals existants inspectés; aucune donnée privée connectée consultée. Les compteurs resultBytes et sqlDurationMs existants peuvent vérifier le volume et surveiller un éventuel surcoût SQL après déploiement; aucune nouvelle collecte nécessaire à la preuve.

Après déploiement habituel, vérifier les dernières notes sur les listes active/secondaires, puis les graphiques aperçu/évaluations et les compteurs SQL sur un même profil. Parcours connecté/mobile/iPad non testé ici. Aucun fichier commun avec les PR ouvertes #68 et #80; aucune dépendance de fusion. Aucune migration, dépendance, fusion, auto-merge ou action production.
