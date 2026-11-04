# Simulation de compétition dans une séance

## Objectif

Permettre au coach d’ajouter une simulation de compétition à une séance planifiée. Le jour de la séance, chaque athlète retrouve la simulation dans le parcours normal de démarrage de son entraînement. Le coach dirige les passages et juge chaque plongeon. Les athlètes jugent depuis leur téléphone lorsqu’ils ne plongent pas et ne sont pas les prochains à plonger.

La simulation est un bloc de séance synchronisé, distinct de l’évaluation de confiance 0–5 déjà utilisée dans DivePlan. Cette spécification ne présume pas d’un règlement officiel ni d’un calcul de résultat homologué.

## Parcours principal

1. Le coach crée ou modifie une séance et ajoute un bloc « Simulation de compétition ».
2. Le bloc reprend par défaut les athlètes assignés à la séance. Le coach confirme les participants, l’ordre de passage, les plongeons et le barème.
3. À l’heure prévue, chaque athlète ouvre la séance depuis l’accueil et choisit « Commencer la séance », comme aujourd’hui.
4. Au bloc simulation, l’athlète voit son rôle courant : juge, plongeur, prochain ou en attente.
5. Le coach démarre la simulation depuis la vue de séance. Cela ouvre le premier passage pour tous les appareils.
6. Le coach et les juges admissibles saisissent leurs notes. Leurs notes restent privées jusqu’à leur envoi.
7. Quand toutes les notes attendues sont reçues, le coach termine le passage et ouvre le suivant. Il peut choisir de continuer avec des notes manquantes en confirmant explicitement cette décision.
8. Le coach termine la simulation. Le résumé des passages et les résultats deviennent visibles selon les paramètres de visibilité définis pour la simulation.

## Maquettes textuelles

Les maquettes décrivent des écrans mobiles. Elles réutilisent l’entrée et la navigation de séance existantes; la simulation ajoute un état en direct au bloc concerné.

### 1. Créateur de séance — ajout du bloc

```text
┌──────────────────────────────────┐
│ Nouvelle séance                  │
│ Groupe : Provincial              │
│                                  │
│ Blocs de la séance               │
│  Échauffement                    │
│  Plongeons                       │
│  [+ Ajouter un bloc]             │
│                                  │
│ Type de bloc                     │
│  ○ Plongeons   ○ Exercices       │
│  ● Simulation de compétition     │
└──────────────────────────────────┘
```

### 2. Configuration du bloc simulation

```text
┌──────────────────────────────────┐
│ Simulation de compétition        │
│ Nom : Simulation 3 m             │
│                                  │
│ Participants                     │
│ ☑ Reprendre les athlètes assignés│
│   6 athlètes                 [Éditer]
│                                  │
│ Ordre de passage                 │
│  1. Léa       [↑] [↓]             │
│  2. Malik     [↑] [↓]             │
│  3. Noa       [↑] [↓]             │
│  …                               │
│                                  │
│ Épreuve : 3 m                    │
│ Plongeons : [Depuis leurs listes]│
│ Barème : [Configurer]            │
│ Juges athlètes : activés         │
│ Règle : plongeur + prochain exclus│
│                                  │
│            [Enregistrer le bloc] │
└──────────────────────────────────┘
```

La liste de plongeons peut être importée des listes de compétition DivePlan, puis ajustée pour cette séance. L’ordre, les participants et les plongeons sont copiés dans la configuration de la séance pour préserver son historique si les profils changent plus tard.

### 3. Athlète — séance du jour

```text
┌──────────────────────────────────┐
│ Séance du jour                   │
│ Simulation 3 m                   │
│ 2 blocs · Simulation prête       │
│                                  │
│              [Commencer la séance]│
└──────────────────────────────────┘
```

Le bouton et le point d’entrée sont ceux de la séance actuelle. Il n’y a pas de deuxième activité à rechercher.

### 4. Athlète — rôle de juge

```text
┌──────────────────────────────────┐
│ SIMULATION EN DIRECT   Passage 2/6│
│                                  │
│ Malik plonge                    │
│ 3 m · 305C                       │
│                                  │
│ Ta note                          │
│ [ 0 ] [ 1 ] [ 2 ] [ 3 ] [ 4 ]   │
│ [ 5 ] [ 6 ] [ 7 ] [ 8 ] [ 9 ]   │
│ [ 10 ]                           │
│                                  │
│ Note privée jusqu’à l’envoi      │
│            [Envoyer ma note]     │
│                                  │
│ 3/4 notes reçues · Coach inclus  │
└──────────────────────────────────┘
```

Le nombre de boutons et les incréments reflètent le barème configuré; les valeurs ci-dessus sont illustratives et ne constituent pas une recommandation de règlement. Après l’envoi, afficher « Note enregistrée » et désactiver le vote pour ce juge et ce passage.

### 5. Athlète — exclu du vote

```text
┌──────────────────────────────────┐
│ SIMULATION EN DIRECT   Passage 2/6│
│                                  │
│ Malik plonge                    │
│ 3 m · 305C                       │
│                                  │
│ Tu es le prochain à plonger.     │
│ Prépare-toi; tu ne juges pas     │
│ ce passage.                      │
│                                  │
│ Votes reçus : 3/4                │
└──────────────────────────────────┘
```

Le plongeur en cours voit « C’est ton plongeon » et les informations utiles pour son passage, sans contrôle de vote.

### 6. Coach — contrôle du passage

```text
┌──────────────────────────────────┐
│ SIMULATION EN DIRECT   Passage 2/6│
│                                  │
│ Malik · 3 m · 305C               │
│                                  │
│ Votes athlètes                   │
│ 3 reçus · 1 en attente            │
│ Coach       [Choisir une note]   │
│                                  │
│ Notes masquées jusqu’à la clôture│
│                                  │
│ [Terminer le passage]            │
│ [Passer avec note manquante…]    │
│                                  │
│ Après clôture : [Plongeur suivant]│
└──────────────────────────────────┘
```

Avant la clôture, le coach voit les états de réception, mais pas les valeurs individuelles, afin de ne pas influencer les juges qui n’ont pas encore voté. Après clôture, il voit le détail, le résumé calculé et peut passer au suivant.

### 7. Coach — résumé final

```text
┌──────────────────────────────────┐
│ Simulation terminée              │
│                                  │
│ Classement (si activé)           │
│ 1. Léa                 142,5     │
│ 2. Malik               139,0     │
│ …                                │
│                                  │
│ 36/36 votes · 1 passage forcé    │
│ [Voir les notes] [Retour séance] │
└──────────────────────────────────┘
```

Les valeurs sont fictives. Le classement et la visibilité des notes doivent pouvoir être désactivés ou différés par le coach.

## Règles fonctionnelles

### Participants et ordre

- Le bloc propose par défaut les athlètes assignés à la séance; le coach peut les retirer ou en ajouter parmi les athlètes de son club.
- Une simulation requiert au moins trois participants si la règle « plongeur et prochain exclus » est active : il faut au moins un juge athlète admissible en plus du coach.
- Chaque passage est associé à un athlète, un rang, un plongeon et une hauteur.
- Les données d’un passage sont figées au démarrage de la simulation. Les corrections ultérieures sont réservées au coach et journalisées.

### Attribution des juges

- Pour un passage de rang `i`, l’athlète qui plonge au rang `i` et l’athlète qui passe au rang `i + 1` ne peuvent pas juger.
- Après le dernier passage, le prochain athlète est le premier de l’ordre, sauf si le coach a désactivé la rotation circulaire. Ce choix est affiché dans la configuration.
- Les athlètes admissibles peuvent voter une seule fois par passage. Le coach vote une fois par passage, indépendamment de son statut dans la liste des athlètes.
- Si le coach marque un athlète absent ou retire un participant avant le départ, l’ordre est recalculé avant le premier passage et présenté pour confirmation.
- Si un participant devient indisponible en cours de simulation, seul le coach peut le marquer absent. Le passage en cours conserve la liste de juges figée au moment de son ouverture; les suivants utilisent la liste mise à jour.

### Votes et clôture

- Un vote contient le juge, le passage, la valeur, l’heure d’envoi et la version du barème.
- Le serveur vérifie l’identité, l’appartenance à la séance, l’admissibilité du juge, la plage de notes et l’unicité du vote. Masquer le bouton côté interface ne suffit pas.
- Une reconnexion ne doit ni perdre un vote confirmé ni en créer un second.
- Les valeurs individuelles restent masquées sur les appareils des athlètes et sur le tableau du coach jusqu’à la clôture du passage. Le coach voit le nombre reçu et les juges encore attendus.
- Le passage est complet lorsque le coach a voté et que tous les juges athlètes admissibles ont voté, ou lorsque le coach confirme une clôture avec votes manquants.
- Une note manquante n’est jamais inventée ni assimilée à zéro. Elle est indiquée comme absente dans le résultat.
- Toute modification de note par le coach après réception crée une trace de correction avec ancienne valeur, nouvelle valeur, auteur et heure.

### Barème et calcul

- Le barème est configuré au niveau du bloc : minimum, maximum, incrément et libellés d’aide facultatifs.
- Le calcul est choisi explicitement : par défaut, le bloc peut afficher les votes reçus sans classement automatique. Une règle de moyenne, retrait des valeurs extrêmes, coefficient de difficulté ou total de compétition ne doit être activée qu’après décision produit et validation du règlement visé.
- Le résultat conserve les notes brutes et la version de la règle de calcul utilisée, pour qu’un changement futur de barème ne réécrive pas l’historique.

### États et récupération

```text
DRAFT → READY → LIVE → COMPLETED
                    ↘ PAUSED → LIVE
                    ↘ CANCELLED
```

- `DRAFT` : séance non publiée ou configuration incomplète.
- `READY` : séance publiée, simulation pas encore démarrée.
- `LIVE` : coach a démarré la simulation et un passage courant est partagé.
- `PAUSED` : arrêt temporaire explicite du coach; aucun nouveau passage ne peut être ouvert.
- `COMPLETED` : tous les passages ont été clôturés et le coach a terminé la simulation.
- `CANCELLED` : le coach a annulé la simulation; les notes déjà envoyées restent dans l’historique avec l’état annulé.
- Une fermeture d’onglet ou perte de réseau ne change pas l’état. À la reconnexion, l’athlète retrouve le rôle et le passage courants.
- Le coach peut reprendre une simulation `LIVE` ou `PAUSED` depuis sa séance.

## Modèle de données proposé

Les évaluations actuelles attachées à `TrainingSession` stockent une confiance sur un plongeon de profil; elles ne doivent pas être réutilisées pour les votes de simulation.

- `CompetitionSimulation` : séance/bloc lié, état, paramètres de barème, règles de visibilité et pointeur vers le passage courant.
- `CompetitionSimulationParticipant` : athlète, ordre, statut de présence et copie de la configuration pertinente.
- `CompetitionSimulationDive` : ordre du passage, participant, code et description du plongeon copiés au démarrage.
- `CompetitionSimulationJudge` (ou calcul d’admissibilité à partir du passage) : attribution figée des juges par passage.
- `CompetitionSimulationScore` : passage, juge (coach ou athlète), valeur, dates et métadonnées de correction.
- Historique des actions : démarrage, pause, reprise, clôture forcée, modification de note et fin.

Les écritures de vote doivent être idempotentes avec une contrainte unique sur `(passage, juge)`. Le changement de passage doit être une opération atomique du serveur afin que les téléphones ne voient jamais deux passages actifs.

## Choix retenus pour le premier incrément

- Le coach coche « Ajouter une simulation de compétition en direct » à la dernière étape de planification de la séance.
- Les participants sont les athlètes actifs du groupe; il faut au moins trois et chacun doit avoir un plongeon dans sa liste active.
- La liste de plongeons active de chaque athlète est copiée à la création, puis jouée en tours : premier plongeon de chaque athlète, deuxième plongeon de chaque athlète, etc. L’ordre des athlètes est alphabétique.
- La note est un nombre entier de 0 à 10. Les votes bruts sont conservés; aucun classement ni calcul officiel n’est produit.
- Le coach doit voter. Il peut avancer normalement lorsque toutes les notes attendues sont reçues ou confirmer le passage avec des notes manquantes.
- Les notes individuelles deviennent visibles après la fin de la simulation. Le coach peut la démarrer depuis la séance; les athlètes entrent au même endroit que pour démarrer leur entraînement.

Ce barème est un choix technique provisoire pour rendre le premier incrément utilisable. Il faudra le remplacer par le barème souhaité avant d’utiliser la simulation pour comparer les résultats.

## Découpage de livraison recommandé

1. Configuration du bloc et copie des participants, de l’ordre et des plongeons.
2. Démarrage depuis la séance normale, rôle d’athlète et formulaire de vote mobile.
3. Console coach, synchro de l’état, progression et reprise après déconnexion.
4. Clôture avec votes manquants, historique des corrections et résumé.
5. Classement/calcul officiel configurable après validation du barème et des règles.

## Critères d’acceptation du premier incrément

- Le coach peut ajouter et publier un bloc simulation dans une séance planifiée.
- Un athlète participant accède au bloc en commençant la séance depuis son accueil habituel.
- Le coach peut démarrer, mettre en pause, reprendre et clôturer la simulation.
- Chaque téléphone affiche le même passage courant après actualisation ou reconnexion.
- Pour un passage donné, le plongeur et le prochain dans l’ordre n’ont aucun contrôle permettant de voter.
- Tous les juges admissibles et le coach peuvent enregistrer une seule note conforme au barème.
- Le coach voit la progression des votes, peut clôturer normalement ou avec des votes manquants, puis ouvrir le passage suivant.
- Un vote déjà confirmé reste présent après rechargement; une nouvelle tentative ne crée pas de doublon.
- Les valeurs individuelles ne sont pas révélées avant clôture.
- Une simulation terminée conserve sa configuration, ses votes et son historique même si la liste de compétition du profil est modifiée plus tard.
