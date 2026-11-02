# Alléger l'identité des sauvegardes automatiques par action serveur

Base : master `141a5000ed1de4b7de12c65cc0b02f859c65b0ca`, branche par défaut vérifiée. PR récentes examinées : #72/#73 ont allégé l'endpoint `/api/athlete/session-progress`, mais pas l'action `saveAthleteProgress` branchée sur `SessionPlayer.onSaveProgress`. PR ouvertes #68 et #86 : aucun fichier commun ni dépendance de fusion avec cette correction.

AGENTS.md et guide Server Actions du Next installé/verrouillé 16.4.3 lus. Celui-ci décrit notamment le POST d'action et le re-rendu RSC dans la même réponse après revalidatePath. Aucun changement de version, dépendance ou migration.

## Défaut et correction

Chaque sauvegarde de bloc chargeait getCurrentAthlete sans les listes de compétition, donc le profil athlète, son utilisateur, son club et son groupe/coach. Le contrôle d'horaire privé assertSessionStartAvailable rechargeait ensuite le même profil. La sauvegarde n'utilise que l'identifiant de l'athlète.

L'action utilise maintenant getCurrentAthleteIdentity, déjà employé par l'endpoint de fermeture de page, et passe cet ID au contrôle d'horaire. L'identité reste obtenue côté serveur : session authentifiée, accès activé, rôle ATHLETE, mot de passe configuré et profil/club existants. Les assignations restent contrôlées avant l'horaire et la persistance.

La finalisation a encore besoin du profil complet pour l'événement et les badges; elle le conserve et transmet son ID déjà obtenu au même contrôle, sans seconde lecture de profil. Le helper reste privé au module d'actions.

La transaction, les SQL métier et les trois invalidations de sauvegarde sont inchangés. Aucun cache partagé, nouveau mécanisme de sauvegarde ou modification des règles de clôture. Les séances fermées par l'horaire restent accessibles aux athlètes déjà en cours/terminés selon les gardes existantes.

## Preuves synthétiques

Commande : `node --import tsx --test src/lib/athlete-action-identity.test.ts`.

Le vrai module d'actions, current-user, athlete-session et athlete-progress sont transpilés dans une VM. Les vrais SQL d'autorisation, d'assignation et de persistance sont exécutés dans PGlite. Session, React.cache, horloge, invalidations et collecte d'événements sont adaptés; le helper de clôture globale et le catalogue des badges sont contrôlés. Aucun serveur Next, session connectée, écriture de télémétrie ou connexion externe.

La référence rétablit uniquement les deux anciennes lectures de profil; les SQL métier restent identiques. Même athlète dans un groupe avec coach, même séance avec exercice, sept répétitions, deux golden reps et ressenti final, même absence d'un autre athlète. Les instantanés de persistance et les invalidations sont égaux.

| Scénario du corps de l'action uniquement | Lectures avant → après | Octets de lignes SQL JSON avant → après |
| --- | ---: | ---: |
| Logo de club synthétique 128 000 caractères, cache simulé par requête | 7 → 4 | 387 054 → 357 |
| Même logo, sans mémoïsation simulée | 8 → 4 | 515 698 → 357 |
| Club sans logo, sauvegarde suivante, cache simulé par requête | 7 → 4 | 3 069 → 366 |

Dans les deux modèles, quatre lectures de profil deviennent une lecture d'ID; les lectures d'assignation et d'horaire restent présentes. Trois écritures métier avant/après. Le gain en octets dépend fortement du logo réellement stocké; sa taille de production n'a pas été observée. Réduction synthétique de 99,9 % dans le premier scénario et 88,1 % sans logo dans le troisième.

Vérifiés : utilisateurs et clubs étrangers, même club sans assignation, session absente/étrangère/brouillon/trop future, accès désactivé, utilisateur sans profil ou club, priorité de l'ID de session sur l'e-mail et fallback e-mail normalisé, rôle/mot de passe, clôture horaire, sauvegarde tardive terminée, finalisation conservant son profil, rollback en erreur et absence d'invalidation mensongère. Les autres tests du dépôt couvrent séparément le cycle de vie global et les badges.

## Limites d'attribution

Les nombres ci-dessus ne sont pas ceux de toute la requête HTTP Next.js. L'action conserve revalidatePath : Next peut ensuite relire le profil/plan pour produire le RSC. Le partage effectif de cache entre action et rendu peut aussi déplacer une lecture entre ces phases. Les deux modèles de cache sont des adaptateurs de test, pas une mesure de React.cache dans un serveur Next réel. Ne pas extrapoler le nombre de lectures évitées du corps de l'action à l'ensemble de sa réponse.

Fast Origin Transfer CDN/compute, transferts navigateur, volume PostgreSQL estimé, HTML/RSC/JSON HTTP et fichiers JavaScript sont distincts. La preuve mesure la somme UTF-8 des lignes SQL représentées en JSON du corps de l'action, pas le protocole PostgreSQL, le RSC, une durée ou la facture. Aucun gain de latence, navigateur ou FOT revendiqué.

## État observé et suite

Le 2 novembre 2026, projet/team/domaine et lien Git Felixmorin/DivePlan reconfirmés via connecteurs. Production READY `dpl_5RBtzMvvQCqhJtETiJngK2Qou2kK`, commit 141a500. Aucun log error/fatal production sur **18:14:38–19:04:38 UTC (13:14:38–14:04:38 Montréal)** ni cluster d'erreur sur 50 minutes; l'absence de logs ne prouve pas l'absence d'incident.

Catalogue des métriques découvert avant interrogation; requête FOT sortant échouée HTTP 400. `/coach/observability` redirige toujours vers `/coach`; instrumentation SQL/requêtes et Web Vitals examinée par le code, aucune donnée connectée consultée ou accès contourné. Aucun effectif, percentile ou gain de production inventé.

Après déploiement habituel, vérifier une sauvegarde et une finalisation sur mobile/iPad. Comparer ensuite les traces SQL existantes pour `/athlete/session/:id`, trigger `action`, avec le même plan et le même scénario, en distinguant corps de l'action et re-rendu. Aucun nouveau collecteur nécessaire pour cette correction; ne pas répéter les propositions d'instrumentation déjà livrées sans nouvel élément.
