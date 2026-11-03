# Limiter la répartition quotidienne aux jours affichés

Base : `master` 3783f8f66c5c1be4bc510d292ba6cf3c5db7cc86, Next installé et verrouillé 16.4.3. AGENTS.md et guide Next local data-security lus. PR récentes et ouvertes examinées : #68 (design coach) et #83 (cycle de vie des agrégats SQL) ne modifient aucun des fichiers de cette correction. Aucune dépendance de fusion.

## Défaut et correction

`getAthleteProgressTotals` chargeait toutes les journées/familles de plongeons, puis ne conservait que les six derniers jours d'activité dans `dailyFamilyChartData`. Le volume du résultat SQL croissait donc avec tout l'historique pour une fenêtre d'affichage fixe.

La requête trouve maintenant les six derniers jours d'activité de cet athlète en America/Toronto et agrège les familles à partir du début local du plus ancien de ces jours. Toutes les familles de ces journées sont conservées, y compris les familles personnalisées. Il s'agit de jours d'activité, pas de six jours calendaires ni de six lignes. La limite SQL et les deux découpages de graphiques partagent la même constante.

Les autres lectures restent complètes : totaux, répartition technique globale, graphiques hebdomadaires/mensuels et huit séances récentes. Les pages athlète et l'aperçu coach utilisent le même chargeur; leurs contrôles d'identité et de club ne changent pas. Aucun cache partagé, nouvelle dépendance, migration ou changement de design.

## Mesure reproductible et régressions

Commande : `node --import tsx --test src/lib/progress-family-window.test.ts`.

Le vrai module est transpilé dans une VM et ses SQL s'exécutent dans PGlite, sans connexion externe. Le test compare tout l'objet retourné au même chargeur exécutant l'ancienne requête de famille. Le schéma minimal et les données sont entièrement synthétiques : 300 journées espacées avec six familles, puis deux journées autour du changement d'heure Montréal/UTC, une famille personnalisée, une seconde identité, une séance terminée et un exercice complété.

| Scénario identique, un chargement complet | Avant | Après |
| --- | ---: | ---: |
| Lignes de la requête de répartition quotidienne | 1 803 | 27 |
| Octets UTF-8 des lignes SQL représentées en JSON | 122 913 | 1 849 |
| Lectures SQL du chargeur complet | 11 | 11 |

Réduction de 98,5 % des octets JSON de cette seule requête. Le test de fenêtre échoue sur le code initial : les anciennes journées sont encore retournées.

Vérifiés : égalité de tous les totaux/graphiques, conservation des jours espacés et de chaque famille affichée, mode coach chartsOnly, isolement entre identités, historique court/vide et propagation des erreurs SQL. Les tests existants couvrent séparément l'autorisation du profil coach avant le chargement des graphiques.

Le test sérialise les appels PGlite et attend la fin des requêtes en attente avant fermeture, y compris lorsqu'une requête du Promise.all échoue. Le chargeur applicatif conserve son parallélisme.

## Limites et vérification après déploiement

Il s'agit d'une réduction démontrée du résultat PostgreSQL représenté en JSON, pas d'une mesure des octets du protocole PostgreSQL. Le nombre d'appels SQL est inchangé. L'identification des jours récents lit encore l'historique; aucun gain CPU, durée SQL ou latence n'est établi. La nouvelle étape de recherche des jours a aussi un coût à surveiller avec les compteurs existants.

Le DTO retourné reste identique : aucun gain de taille HTML/RSC/JSON HTTP, fichiers JavaScript, transfert navigateur, Fast Origin Transfer CDN/compute ou facture n'est revendiqué. Ne pas confondre ces volumes avec le résultat SQL.

Le 2 novembre 2026, projet/team/domaine et lien Git Felixmorin/DivePlan reconfirmés par connecteurs. Production READY : dpl_FmDDopV1kgZZAkPJBmoHek6VTvyX, commit 3783f8f. Aucun log error/fatal production entre 15:08:38 et 15:58:38 UTC (10:08:38–10:58:38 Montréal), ni cluster d'erreur sur 50 minutes. L'absence de logs ne prouve pas l'absence d'incident. Catalogue des métriques découvert avant requête; FOT sortant indisponible HTTP 400. Pas de statistique privée ou de pg_stat_statements consulté/modifié.

`/coach/observability` redirige vers `/coach`; son instrumentation existante a été inspectée par le code. Aucun accès connecté disponible ou contourné. Aucun percentile, effectif Web Vitals ou coût réel inventé.

Après déploiement habituel, comparer les octets de résultat et durées SQL sur les routes de progression/aperçu avec des historiques similaires, puis vérifier les six jours et les graphiques historiques sur mobile/iPad. Le test local et la preview ne valent pas validation du parcours connecté de production. Pas de nouvelle métrique proposée : réutiliser les mesures SQL existantes avant d'ajouter de la collecte.
