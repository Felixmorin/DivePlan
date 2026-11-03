# Regrouper les dates de plongeon sans recopies quadratiques

## Défaut et changement

Inspection du 3 novembre 2026, branche par défaut `master`, commit
`5a7d771bd47c857ca4781d0410968270c7d17ad6`. La page
`/athlete/progress/details` regroupe les résultats SQL quotidiens par plongeon.
À chaque ligne, `[...datesExistantes, row]` recopiait toutes les dates déjà
rencontrées pour ce plongeon, puis remplaçait le tableau dans la Map.
Pour n dates d'un même plongeon, cela ajoute n(n−1)/2 copies de références.

Le regroupement crée désormais un tableau à la première ligne, puis ajoute
chaque ligne suivante par `push`. L'index est local au rendu serveur, sans
cache partagé. Aucune mutation des lignes SQL elles-mêmes. Ordre des dates,
clés famille/code/hauteur/libellé, volumes et HTML sont conservés. La requête
SQL, le filtrage, les autorisations et les données transmises ne changent pas.

## Preuve synthétique

`node --import tsx --test src/lib/progress-details-grouping.test.ts`

La page réelle et sa requête s'exécutent avec PGlite, des athlètes fictifs et
une horloge de test au 27 juin 2027. Le mode avant rétablit seulement la ligne
de regroupement précédente. Le test observe les itérations des tableaux de
dates et les remplacements dans la Map ; aucune instrumentation ajoutée au produit.
Une exécution par variante du scénario de 12 plongeons et 300 jours par plongeon :

| Travail de regroupement | Avant | Après |
| --- | ---: | ---: |
| Références de dates recopiées par spread | 538 200 | 0 |
| Tableaux successivement stockés dans l'index | 3 600 | 12 |
| Lignes de dates SQL / HTML rendu | 3 600 | 3 600 |
| Requêtes SQL de données | 1 | 1 |
| Octets de résultats SQL en JSON | 374 401 | 374 401 |

Le compteur de tableaux concerne l'index de regroupement, pas toutes les
allocations du processus ni celles du rendu React. Les rendus HTML statiques
avant/après sont identiques, y compris les 3 600 dates. Les tests couvrent
aussi la limite de sept plongeons, « Voir tous », les périodes semaine/mois/saison,
familles, mêmes codes à différentes hauteurs, plateformes personnalisées,
sommes intrajournalières, autres athlètes, historique vide, absence de session
et propagation des erreurs SQL. Authentification et composants UI périphériques
simulés ; aucun parcours connecté mobile/iPad ou de production testé.

Ces compteurs prouvent la suppression d'un travail quadratique. Ils ne mesurent
pas un gain de durée CPU, de latence ou de facture. La requête SQL et le HTML
ne deviennent pas plus petits. Le volume PostgreSQL estimé en JSON n'est pas
le volume du protocole PostgreSQL ; il reste identique. Fast Origin Transfer
CDN/compute, transferts navigateur, tailles HTML/RSC/JSON et fichiers JavaScript
sont distincts et aucun gain sur ces transferts n'est revendiqué.

## État observé et validation

Projet Vercel `dive-plan`, projet `prj_P775WajMS3NIVzjDXawTdlRZ4CvT`, équipe
`team_lAR7ON9BjPKPDVdpEaMPmDjz` : correspondance revérifiée avec
Felixmorin/DivePlan et `dive-plan.vercel.app` avant diagnostic. Production READY
`dpl_Aczq2E5xy9n5kR2puQDKayGAYWcD`, commit `5a7d771`. Aucun log error/fatal
de production retourné entre le 2026-11-03 13:13:45.839 et 14:03:45.839 UTC
(08:13–09:03 Toronto, 50 minutes), ni erreur runtime retournée sur 50 minutes.
L'absence de logs ne prouve pas l'absence d'incident.

Schéma métrique découvert avant requête ; somme
`vercel.function_invocation.fot_out_bytes` échouée HTTP 400.
`/coach/observability` redirige vers `/coach` dans le code. Instrumentation
examinée par le code, aucune page connectée ni donnée réelle consultée.
La vue Performance expose des moyennes et effectifs LCP/INP/CLS, sans
distribution ; FCP/TTFB sont collectés mais absents de cette vue. Aucune
évolution réelle des Web Vitals n'est attribuée à cette correction.

AGENTS.md et documentation locale Next.js 16.4.3 lus. Tests, TypeScript, lint,
revue du diff, CI/build normal et preview : résultats finaux consignés dans la PR.
Build local non relancé après le refus automatique antérieur lié à Sentry ;
build CI vérifié séparément. #94 touche la même page pour omettre une liste
de compétition inutilisée dans le contexte ; combinaison à vérifier et consigner
avant publication prête à réviser. #92/#93 et #68 concernent d'autres fichiers.
Aucune migration ou dépendance prévue. Aucune fusion, auto-merge ou promotion
en production effectuée. Après déploiement approuvé séparément, vérifier les
périodes et l'expansion d'un historique long sur mobile/iPad.

## Métrique à développer — proposition distincte, non implémentée

**Question : quelle part des dates déjà rendues est réellement ouverte ?**
Le code charge et rend des détails fermés par défaut. Les octets par requête
existants ne disent pas si ces détails sont consultés. Cette information aiderait
à décider si un chargement à l'ouverture vaut ses appels supplémentaires ;
elle ne permettrait pas, à elle seule, de promettre une baisse de facture.

**Mesure proposée : `progress.details.date_rows_used_ratio`.** Source navigateur :
compter les groupes `<details>` et lignes `.progress-dive-date` présents après
hydratation ; compter les lignes de chaque groupe lors de sa première ouverture.
Début : montage du rendu de détail, fin : sortie de ce rendu ou `pagehide`.
Ratio agrégé = somme des lignes ouvertes / somme des lignes rendues sur les
rendus échantillonnés, accompagné des deux compteurs et du nombre de rendus.
Le dénominateur est le HTML rendu, pas toutes les lignes SQL. Un groupe rouvert
ne compte pas deux fois. Aucun code de plongeon, texte, date sportive ou identifiant
d'athlète collecté. Dimensions bornées : route normalisée, période semaine/mois/saison,
classe d'écran mobile/tablette/desktop, version injectée par le serveur.

**Collecte proposée :** décision aléatoire de 10 % par rendu, compteurs de début
et de fin regroupés dans la télémétrie navigateur existante. Stockage révisable
par UUID éphémère de rendu avec contrainte unique et mises à jour idempotentes
des compteurs cumulatifs ; agrégation horaire, fenêtres 24 h et 7 jours, rétention
7 jours. Afficher effectifs et taux de fins reçues / débuts reçus, sans assimiler
ces rendus échantillonnés à toutes les visites. Aucun percentile à déduire de ce ratio.

**Travail et coût :** petit observateur client de `toggle`, validation numérique
du collecteur existant, migration révisable d'une table de déduplication et lecture
agrégée ; estimation interne 0,5–1 journée. Cible de payload à mesurer : moins
de 400 octets par rendu échantillonné pour les deux messages. Au plus deux
écritures logiques et une ligne retenue par rendu échantillonné ; éviter les
réécritures sur doublons identiques. Réutiliser les batches existants, avec au
plus deux envois si aucun batch n'est disponible. Aucun nouveau service.

**Référence et fiabilité :** établir les effectifs, couverture et ratios sur
7 jours après déploiement séparé ; aucun seuil reconnu ou cible numérique de
chargement différé fixé avant cette référence. Valider réouvertures, navigations
RSC, filtres, messages dupliqués/perdus/hors ordre, égalité avec les éléments DOM,
et bornes de payload. Comparer débuts/fins pour rendre la perte visible ; un
beacon accepté n'est pas une preuve d'écriture serveur. Horodatage serveur pour
les buckets : pas de durée dépendante de l'horloge du client. Profiler l'impact
du listener et des comptages DOM sur un historique long avant activation.
Cette collecte n'est pas ajoutée par la présente PR et n'est pas annoncée active.
