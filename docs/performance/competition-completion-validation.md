# Finaliser après l’évaluation de la liste active

Base : master `b9148d1620a41ec810d57ad1683d873d9a83300b`.

## Défaut

Le lecteur et `saveCompetitionDiveEvaluation` affichent/enregistrent seulement les plongeons de la liste active (`CompetitionDiveList.position = 0`). Pourtant, `completeAthleteSession` comparait le nombre d’évaluations de la séance au nombre de plongeons de toutes les listes de l’athlète. Deux plongeons actifs évalués et un plongeon secondaire non affiché empêchaient donc la finalisation. Une simple comparaison de totaux ne prouvait pas non plus que chaque plongeon requis avait été évalué.

## Correction

Quand une évaluation est prévue au début ou dans un bloc assigné, une requête NOT EXISTS vérifie qu’aucun plongeon actif n’est dépourvu d’évaluation ATHLETE pour cet athlète et cette séance. Les évaluations secondaires, historiques, d’un autre athlète, d’une autre séance ou COACH ne remplacent pas un plongeon actif manquant. Une liste active vide ne bloque pas, comme dans le lecteur.

Authentification, assignation, disponibilité de séance, persistance/finalisation transactionnelle, répétitions, golden reps, ressenti, notes, badges et invalidations restent inchangés. Aucun schéma, cache, service ou dépendance ajouté. Ce travail ne redéfinit pas le changement de liste active pendant une séance ou les règles des badges de liste.

## Preuve synthétique

`node --import tsx --test src/lib/competition-completion.test.ts`

Le test exécute les vraies fonctions serveur de sauvegarde d’évaluation et de finalisation extraites par AST, avec leurs vrais SQL dans PGlite. Les deux plongeons actifs sont effectivement enregistrés par la vraie sauvegarde d’évaluation; le contrôle de finalisation est ensuite exercé. Identité, assignation, disponibilité et cache sont contrôlés aux frontières. La persistance de progression est simulée : son callback transactionnel n’est pas exécuté par ce test. Il vérifie la transmission inchangée des répétitions, golden reps, exercices, notes et ressenti à cette frontière. La suite de persistance existante vérifie séparément ses écritures et son rollback.

Même scénario, une exécution avant/après :

| Contrôle avant la persistance | Avant | Après |
|---|---|---|
| Deux plongeons actifs évalués + un plongeon secondaire | Refus « Réponds à tous… » | Autorisé |
| Lectures d’activation/complétude après identité et assignation | 3 | 2 |
| Dont lectures de complétude | 2 | 1 |

Autres cas : plongeon actif manquant malgré des totaux égaux; évaluation historique d’un plongeon supprimé; autre liste/athlète/séance/auteur; évaluation prévue dans un bloc; évaluation désactivée; liste active vide; identité/assignation refusées avant toute lecture d’évaluation. Aucune fréquence de ce problème observée en production.

Ce résultat est une correction de fiabilité et une lecture SQL en moins sur le parcours concerné, pas une mesure d’octets, de latence ou de facture. Fast Origin Transfer CDN/compute, transferts navigateur, volume PostgreSQL estimé, HTML/RSC/JSON HTTP et taille des fichiers JavaScript sont distincts et ne sont pas mesurés ici.

## Contexte et révision

Projet Vercel, équipe, domaine dive-plan.vercel.app et lien Git Felixmorin/DivePlan reconfirmés via connecteurs. Production examinée READY `dpl_12kfmkgRAjL3MHPrws6aDNoToF2X`, commit de base. Le 30 octobre 2026, aucun log error/fatal production sur **22:21:18–23:11:18 UTC (18:21:18–19:11:18 Montréal)** ni cluster d’erreur sur 50 minutes; cette absence ne prouve pas l’absence d’incident ou l’utilisation du parcours. Catalogue des métriques découvert; FOT sortant indisponible HTTP 400, CLI Vercel absente.

`/coach/observability` redirige vers `/coach`. Instrumentation existante SQL et navigateur/Web Vitals examinée dans les passages de cette analyse; aucune donnée privée connectée consultée. Pas de nouvelle métrique nécessaire pour établir ce défaut déterministe; compteurs SQL existants utilisables après déploiement, sans les assimiler au FOT.

La PR #77 touche aussi actions.ts mais dans l’upsert de démarrage, à un autre emplacement. Son patch s’applique sans conflit à cette correction; aucun ordre imposé. Aucun fichier commun avec #68 ou #78. Aucune fusion, auto-merge, migration ou action production effectuée.

Après déploiement habituel : avec une séance de test autorisée et une liste secondaire, évaluer les seuls plongeons affichés puis finaliser; vérifier répétitions, golden reps, ressenti et statut COMPLETED. Parcours navigateur connecté/mobile/iPad non testé ici.
