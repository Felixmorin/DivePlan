# Rattacher les agrégats SQL horaires au cycle de vie de la réponse

Base : master `c84f571033ac5ee8996a92ce9c1b5e010600d0a1`.

## Défaut de fiabilité

`recordDatabaseResult` enregistrait les agrégats `DatabaseEgressTelemetryHour` depuis un setTimeout de 500 ms, avec des écritures lancées sans attente de leur fin. Ce travail n’était pas rattaché à la réponse Next.js. Sur un runtime serverless qui suspend ou termine le travail après la réponse, le lot peut être abandonné. C’est une faiblesse vérifiable du code, pas une perte quantifiée ou un incident constaté en production.

Les compteurs par requête HTTP de `ServerRequestMetric` utilisaient déjà after; cette correction concerne le collecteur horaire distinct dans db.ts.

## Correction

Dans un contexte Next.js, un seul callback after est enregistré par portée de collecte. Il attend les écritures des lots route/composant après la réponse, sans bloquer la requête métier. Le callback utilise uniquement la portée et les compteurs capturés : aucun headers/cookies ou autre API de requête n’y est lu, conformément à la documentation Server Components.

Les buckets sont vidés avant les attentes SQL. Une lecture arrivant pendant un flush peut planifier un nouveau lot sans recompter les anciens échantillons. Le fallback CLI reste un minuteur débouncé de 500 ms lorsque after n’est pas disponible; il est annulé si un cycle de vie devient disponible avant son exécution. Les erreurs d’écriture de métriques restent isolées, sans annuler le travail métier ni réessayer une écriture additive ambiguë.

Même table, schéma, dimensions et calculs : nombre de SQL réussis hors BEGIN/COMMIT/ROLLBACK, somme des octets UTF-8 des lignes représentées en JSON, durée cumulée/max et seuil interne existant de 200 ms pour les requêtes lentes. L’heure reste celle de l’écriture, via l’horloge PostgreSQL. Aucun nouveau contenu, paramètre SQL ou résultat d’athlète stocké; aucun nouveau taux d’échantillonnage, service ou mécanisme de rétention.

## Preuve synthétique

`node --import tsx --test src/lib/database-egress-lifecycle.test.ts`

Le test exécute le vrai module db.ts et ses vraies écritures SQL dans PGlite, derrière un adaptateur Pool contrôlé. AsyncLocalStorage et AsyncResource sont réels; Next.after, minuteurs, collecteur ServerRequestMetric et environnement de connexion sont simulés. Aucune connexion externe.

Même scénario de réponse courte avec trois lectures SQL réussies; seuls les callbacks de fin de réponse sont exécutés et les minuteurs sont abandonnés :

| Collecteur horaire | Avant | Après |
|---|---|---|
| Agrégat écrit en fin de réponse | Aucun | 1 |
| Lectures comptabilisées dans cet agrégat | 0 | 3 |
| Exécution des minuteurs après réponse | Aucune | Aucune |

La somme des octets JSON est vérifiée contre les trois résultats. Un seul lot est écrit pour le même couple route/composant; un second appel de fin de cycle n’ajoute pas de doublon. Ce scénario modélise une suspension du runtime, il ne mesure ni son occurrence ni un taux de perte réel.

Autres régressions : requêtes concurrentes de deux clubs avec routes/composants distincts; attribution du club après le premier SQL d’authentification; absence de club; exclusion des frontières de transaction; transaction enregistrée malgré panne de télémétrie; rollback et erreur métier préservés; callback qui attend effectivement un INSERT retardé; échantillon tardif pendant un flush; fallback CLI débouncé et annulation de son minuteur.

Les tests du reste de l’application vérifient séparément les règles métier. Le nouveau test n’exécute pas Next.after sur une plateforme réelle : sa garantie de cycle de vie provient du contrat Next.js 16.4.3 documenté dans node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md.

## Coût et limites

Le but est de conserver les mesures, sans gain de transfert ou de facture revendiqué. Restaurer des lots auparavant abandonnés peut augmenter les écritures d’observabilité réellement effectuées. Regroupement par route/composant conservé : pas d’écriture ajoutée par requête SQL métier. Les lots tardifs peuvent produire un deuxième flush, comme une nouvelle période de collecte.

After reste soumis au maxDuration de la route et aux échecs de base/plateforme. Une erreur d’écriture peut toujours perdre un lot; aucun retry n’est ajouté pour éviter les doubles incréments. Cette correction ne modifie pas la rétention, la granularité horaire ou les compteurs distincts ServerRequestMetric.

Fast Origin Transfer CDN/compute, transferts navigateur, volume PostgreSQL estimé, HTML/RSC/JSON HTTP et fichiers JavaScript sont distincts; aucun de ces volumes, ni une latence, n’est mesuré dans la preuve. L’application ne collecte ces lots avec ce cycle de vie qu’après déploiement; aucune collecte corrigée présentée comme observée en production.

## Observabilité et validation après déploiement

Le 2 novembre 2026, projet/team/domaine dive-plan.vercel.app et lien Git Felixmorin/DivePlan reconfirmés via connecteurs. Production examinée READY `dpl_3VWNBj6wJzMnMQfK74j5N8znbxf5`, commit de base. Aucun log error/fatal sur **14:30:41–15:20:41 UTC (09:30:41–10:20:41 Montréal)** ni cluster d’erreur sur 50 minutes; cela ne prouve pas l’absence d’incident ou de perte de télémétrie.

Catalogue de métriques découvert avant interrogation; FOT sortant indisponible HTTP 400, CLI Vercel absente. `/coach/observability` redirige vers `/coach`. Instrumentation SQL/request et collecte Web Vitals existantes inspectées, aucune donnée privée connectée consultée. Il s’agit d’une correction ciblée de la collecte existante, pas d’une nouvelle métrique.

Après déploiement habituel, effectuer des requêtes autorisées courtes puis comparer les compteurs horaires par route/composant avec les traces ServerRequestMetric sur la même période, en tenant compte des périmètres/exclusions distincts. Vérifier absence de double comptage, erreurs d’écriture et surcoût SQL des lots. Parcours connecté/mobile/iPad non testé ici.

Aucun fichier commun avec les PR ouvertes #68/#80/#81/#82 vérifiées; aucune dépendance de fusion. Aucune migration, nouvelle dépendance, fusion, auto-merge, modification de données/secrets ou action production.
