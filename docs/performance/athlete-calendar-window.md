# Borner l'index du calendrier aux dates consultées

Base : master `141a5000ed1de4b7de12c65cc0b02f859c65b0ca`, après fusion de #85. Branche par défaut, commits et PR récentes examinés. Seule autre PR ouverte : #68; aucun fichier commun avec cette correction, aucune dépendance ou ordre de fusion nécessaire.

AGENTS.md et guide Server and Client Components du Next installé/verrouillé 16.4.3 lus. MonthCalendar reste un Server Component; aucun composant client, cache, dépendance ou migration ajouté.

## Défaut et correction

MonthCalendar développait chaque événement depuis son premier jusqu'à son dernier jour, avec parsing, arithmétique de dates et conversions America/Toronto à chaque pas. Un événement d'un an produisait 365 entrées, même pour une grille de 42 jours. Chaque ajout recopiait aussi la liste des événements de la journée.

L'index parcourt maintenant les clés des 42 jours de grille et, si nécessaire, la date sélectionnée hors grille. Les bornes de chaque événement sont converties une fois et comparées aux clés de dates déjà disponibles. Les listes de l'index local sont complétées sans recopie à chaque insertion. Aucun travail n'est proportionnel à la durée complète d'un événement.

La sélection hors grille est conservée pour les liens enregistrés. Les détails du mois, l'ordre des événements, les annulations, horaires, compétitions et camps gardent le même rendu. Aucun changement des lectures SQL, gardes d'accès, événements stockés ou règles sportives.

## Preuve synthétique

Commande : `node --import tsx --test src/lib/athlete-calendar-window.test.ts`.

Le vrai module de page est transpilé et exécuté avec les fonctions de fuseau horaire réelles, une horloge fixe, un adaptateur JSX et un Map observé. La référence réintroduit uniquement la boucle d'indexation originale. L'arbre des éléments retournés est comparé intégralement. Ce test n'est ni une mesure HTTP/RSC ni un navigateur connecté.

Même scénario : douze événements synthétiques couvrant l'année 2026, calendrier de novembre, aucune date sélectionnée hors grille.

| Travail et index retenu | Avant | Après |
| --- | ---: | ---: |
| Dates présentes dans l'index | 365 | 42 |
| Associations événement/jour retenues | 4 380 | 504 |
| Appels directs à addMontrealDays dans le composant | 4 423 | 43 |
| Appels directs à toMontrealDateInputValue | 8 882 | 110 |

Même arbre de rendu. Réduction de 99,0 % des appels directs d'arithmétique de dates dans ce scénario; pas une mesure de temps CPU ou de latence. Pour des événements courts, le nouveau code compare jusqu'à 42/43 clés, mais ne développe plus les jours par parsing/arithmétique/formatage.

Autres vérifications : fin et début du changement d'heure Montréal, mois adjacents, date hors grille incluse ou sans événement, date inexistante normalisée par JavaScript (31 février : état vide conservé), dates inversées, fin à minuit, événement sans fin, catégories/annulations/publics conservés et calendriers vides. Le vrai point d'entrée vérifie toujours l'athlète avant ses lectures ciblées; nombre de lectures conservé (2 en grille, 1 en liste). Aucun test ne lit de données de production.

## État et limites des mesures

Le 2 novembre 2026, projet/team/domaine et lien Git Felixmorin/DivePlan reconfirmés : production READY `dpl_5RBtzMvvQCqhJtETiJngK2Qou2kK`, commit 141a500. Aucun log error/fatal production de **17:08:10 à 17:58:10 UTC (12:08:10–12:58:10 Montréal)** ni cluster d'erreur sur 50 minutes. L'absence de logs ne prouve pas l'absence d'incident.

Schéma des métriques découvert avant interrogation; requête FOT sortant échouée HTTP 400. Pas d'accès connecté disponible : `/coach/observability` redirige vers `/coach`, collecte SQL/requêtes et Web Vitals examinée par le code, sans lecture privée ou contournement. Aucun effectif/percentile Web Vitals de production inventé.

Fast Origin Transfer CDN/compute, transferts navigateur, volume PostgreSQL estimé, HTML/RSC/JSON et JavaScript sont des volumes distincts. Cette correction réduit le travail et les associations retenues sur le serveur; aucun de ces volumes, économie de facture ou gain de latence n'est mesuré/revendiqué. Les compteurs SQL existants ne mesurent pas cette boucle de rendu. Parcours mobile/iPad connecté non testé.

Après déploiement habituel : vérifier la grille et les détails des événements longs, les changements d'heure et les liens de sélection; observer la durée de fonction par version si disponible. La preuve locale ne permet pas d'estimer la fréquence réelle des longs événements.

## Métrique à développer — proposition distincte, non implémentée

**Question et décision.** Le temps d'affichage du calendrier vient-il encore de l'indexation des événements ou surtout des lectures SQL/autres phases ? Les traces ServerRequestMetric mesurent aujourd'hui le SQL, pas cette étape. Une durée ciblée permettrait de décider si poursuivre l'optimisation du rendu est utile. Aucun besoin d'instrumentation supplémentaire pour prouver la borne algorithmique de cette PR.

**Définition.** `calendar.index.duration_ms` : somme des durées d'indexation par requête HTTP serveur, en millisecondes. Début juste avant la construction des clés/index, fin juste après le remplissage de eventsByDay, via performance.now() monotone. Stocker aussi le nombre d'invocations et d'événements traités; agréger ce dernier en classes 0, 1–10, 11–50, >50. Dimensions : route normalisée `/athlete/calendar`, environnement et version déployée à rétention limitée. Aucun mois, identifiant d'événement/athlète, contenu ou paramètre d'URL.

**Collecte et distribution.** Échantillon déterministe de 10 % des UUID de requête déjà générés par le proxy. Réutiliser la portée et l'écriture existantes ServerRequestMetric; observations brutes nullable plutôt qu'une moyenne préagrégée. Fenêtres 24 h et 7 jours, effectif publié systématiquement; p50/p75/p95 calculés sur ces observations, jamais sur les moyennes SQL. Garder la rétention existante de 7 jours, avec sa suppression quotidienne; aucun échantillon ne peut être promis avant déploiement/observation.

**Changements et coût à préparer dans une autre PR.** Colonnes nullable de durée, compteurs et version dans ServerRequestMetric, script de migration révisable, mise à jour du flush et de la vue d'analyse. Aucune écriture ni requête réseau supplémentaire par rapport à la trace actuelle; deux lectures d'horloge par invocation échantillonnée, valeurs de compteurs et stockage supplémentaires. L'ordre de grandeur du stockage dépend du trafic et des types retenus, à mesurer sur jeu synthétique avant proposition finale. Effort estimé : une demi-journée à une journée, sans nouvelle dépendance/service. Ne pas exécuter la migration en production automatiquement.

**Référence et fiabilité.** Référence réelle inconnue : établir durée et effectifs par version/classe d'événements avant de fixer une cible interne; aucun seuil standard reconnu pour cette boucle. Tester horloge contrôlée, invocations multiples (additionner le travail, pas dupliquer la requête), isolation des portées, trace idempotente et échecs de collecte. Comparer requêtes éligibles et traces échantillonnées pour détecter pertes/couverture; les requêtes de retry ont leur propre UUID. Mesurer le coût activé/désactivé et valider le budget interne de surcoût avant activation. L'horloge monotone évite les ajustements de l'heure murale; la corrélation reste celle de la requête existante.
