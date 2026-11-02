# Charger seulement les deux événements affichés sur l'accueil athlète

Base : master `50f8757ea3c570f9ff728313da067c660358fc1b`, après fusion des PR #83 et #84. Branche par défaut, commits récents et PR d'optimisation revérifiés. Seule autre PR ouverte : #68, dont les fichiers ne recoupent pas cette correction. Aucune dépendance ou ordre de fusion requis.

AGENTS.md applicable et guide local data-security du Next installé/verrouillé 16.4.3 lus. Aucune nouvelle dépendance, migration ou modification du lockfile.

## Défaut et comportement

L'accueil `/athlete` appelait `getAthletePlanningEvents` sur l'horizon par défaut de 183 jours. Il recevait entraînements, annulations et tous les camps/compétitions de cette période, puis filtrait les événements futurs non annulés et conservait deux éléments.

`getAthleteUpcomingHighlights` conserve le même horizon, les mêmes colonnes et les mêmes règles de visibilité club/athlète/groupe, puis applique dans SQL les types CAMP/COMPETITION, l'absence d'annulation, la date future et LIMIT 2. L'instant courant est capturé une seule fois avant la lecture, plutôt que recalculé après la requête dans chaque filtre. À date égale, l'identifiant fournit un ordre stable auparavant non spécifié.

La requête et le mapping restent partagés avec le calendrier. La limite et les filtres supplémentaires ne s'activent que pour l'accueil. Le calendrier complet, la semaine et les chevauchements gardent leur comportement. Les quatre chargements parallèles de l'accueil, l'authentification préalable, la séance disponible et les liens de calendrier restent en place; aucun nouveau rafraîchissement ni appel réseau.

## Preuve synthétique

Commande : `node --import tsx --test src/lib/athlete-highlights.test.ts`.

Le vrai module SQL est exécuté dans une VM avec une horloge fixe et PGlite, sans connexion externe. Le scénario contient 120 entraînements, 30 camps, les prochains événements personnels/club, des annulations, un événement plus tôt le même jour, un camp déjà commencé, une borne de fin et des événements d'autres clubs, groupes et athlètes. Toutes les données sont synthétiques.

La référence exécute le chargement complet utilisé auparavant, puis son filtre d'affichage original. Les deux événements retournés et leurs champs sont identiques.

| Lecture des événements « À venir », même scénario | Avant | Après |
| --- | ---: | ---: |
| Lignes SQL | 154 | 2 |
| Octets UTF-8 des lignes SQL en JSON | 35 176 | 439 |
| Appels SQL | 1 | 1 |

Réduction de 98,8 % des octets JSON de cette lecture. Ce n'est ni le volume SQL total de l'accueil ni une mesure des octets du protocole PostgreSQL. Aucun temps CPU, durée SQL ou gain de latence établi.

Régressions vérifiées : égalité avec le filtre initial, calendriers complets et chevauchements, publics club/personnel/groupe et groupe absent, autre club, vide, borne inférieure inclusive/fin exclusive, ordre stable à date égale et propagation d'erreurs SQL. Le vrai module de page est aussi exécuté avec adaptateurs de données/JSX : il appelle la lecture bornée, conserve la semaine, la séance, le lien d'événement et l'état vide, refuse le chargement sans athlète et propage les erreurs de données. Cela ne constitue pas un test navigateur connecté.

## Observabilité et limites

Le 2 novembre 2026, projet `dive-plan`, projectId `prj_P775WajMS3NIVzjDXawTdlRZ4CvT`, teamId `team_lAR7ON9BjPKPDVdpEaMPmDjz`, domaine et lien Git Felixmorin/DivePlan reconfirmés via connecteurs. Production READY : `dpl_8wxc1XqvbBY4Xi1SdJbYDK7ytCA4`, commit 50f8757.

Aucun log error/fatal production du **2 novembre, 16:07:00–16:57:00 UTC (11:07:00–11:57:00 Montréal)**, ni cluster d'erreur sur 50 minutes. L'absence de logs ne prouve pas l'absence d'incident. Catalogue des métriques découvert avant requête; interrogation FOT sortant échouée HTTP 400, CLI Vercel absente. Aucun chiffre de consommation inventé ni statistique PostgreSQL de production consultée/réinitialisée.

`/coach/observability` redirige toujours vers `/coach`. Instrumentation existante SQL, transfert et Web Vitals examinée dans le code, aucune donnée connectée consultée ou connexion contournée. Les moyennes de Web Vitals et leurs effectifs agrégés ne sont pas des percentiles ou des visites.

Le résultat HTTP affichait déjà seulement deux événements : aucun gain de taille HTML/RSC/JSON HTTP, JavaScript, transfert navigateur, Fast Origin Transfer CDN/compute ou facture n'est revendiqué. Le gain démontré concerne le résultat PostgreSQL représenté en JSON. Le gain réel dépend du nombre d'événements visibles sur l'horizon. Aucun changement des résultats sportifs, présences, répétitions ou golden reps.

Après déploiement habituel, vérifier les deux événements et la navigation calendrier sur mobile/iPad, puis comparer octets/durées SQL de `/athlete` sur des calendriers comparables avec l'instrumentation existante. Aucun cache partagé ni nouvelle mesure nécessaire à cette correction; collecte et gain de production non présentés comme déjà observés.
