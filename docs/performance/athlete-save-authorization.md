# Autoriser les sauvegardes sans recharger le plan

Constat au 30 octobre 2026, base `master` : `8ced78ec97157b65c033d82b8e28b856062fd858` (PR #74 fusionnée).

`getAssignedSessionBlocks` exécutait cinq SELECT et reconstruisait le plan : descriptions des blocs, notes, paramètres d'exercices, sections et plongeons. Ses consommateurs utilisaient seulement la présence d'un bloc et les identifiants d'exercices/plongeons pour autoriser une écriture.

La requête charge désormais les seuls identifiants dans un statement, avec une CTE des blocs assignés et trois branches UNION ALL (bloc, exercice, plongeon). Les branches évitent un produit cartésien entre exercices et plongeons. Aucun tri d'affichage n'est nécessaire. Les blocs vides restent représentés. Aucun cache n'est ajouté.

Parcours concernés : sauvegarde de progression par action serveur, sauvegarde de sortie de page via `/api/athlete/session-progress`, finalisation de séance et note personnelle de plongeon. Le payload navigateur et les écritures sportives restent identiques. Aucune migration.

## Preuve synthétique

Exécution locale avec PostgreSQL embarqué PGlite, sans données réelles. Même fixture que `src/lib/athlete-assigned-items.test.ts`, avant les mutations des sous-tests :

- deux blocs assignés, dont un vide;
- deux exercices et deux plongeons dans le bloc mixte;
- un autre athlète du même club et une séance d'un autre club;
- textes synthétiques de description et notes (répétés 100 fois).

Le chargeur précédent a été lu depuis le commit de base avec `git show`, transpilé et exécuté avec le même adaptateur `query` et la même instance PGlite que le nouveau chargeur. Le compteur additionne les appels SQL; le volume additionne `Buffer.byteLength(JSON.stringify(result.rows))` pour chaque appel. Un scénario de lecture a été mesuré pour chaque version.

| Mesure du chargeur d'autorisation seulement | Avant | Après |
|---|---:|---:|
| SELECT | 5 | 1 |
| Résultats SQL représentés en JSON, octets | 3 742 | 329 |

Réduction de 91,2 % dans cette fixture. Le gain dépend des notes et du nombre d'éléments. Le test permanent vérifie qu'une augmentation des descriptions/notes à 100 000 caractères ne change plus les résultats chargés.

Ce volume est une estimation des résultats PostgreSQL, hors protocole/TLS. Ce n'est ni le Fast Origin Transfer CDN/compute, ni un transfert navigateur, ni une taille HTML/RSC/JSON de réponse HTTP ou de fichiers JavaScript. Les requêtes d'authentification, de contrôle horaire et d'écriture restent hors de cette comparaison. Aucun délai ou gain de facture n'est revendiqué.

## Vérifications et limites

- Les tests exécutent le vrai SQL : isolation des assignations entre utilisateurs/clubs, révocation immédiate, bloc vide, plusieurs sections, bloc mixte, séance inexistante et états READY/IN_PROGRESS/COMPLETED non commencée ou déjà commencée/terminée.
- La vraie persistance vérifie les identifiants autorisés, répétitions supplémentaires, golden reps et ressentis. Les tests existants conservent la couverture de déduplication, rollback et finalisation.
- La vraie fonction de note personnelle vérifie ajout, suppression, refus d'un plongeon non assigné ou d'un autre club et absence d'athlète connecté. Ses dépendances d'authentification et de validation de formulaire sont remplacées dans ce test; le SQL et le chargeur sont réels.
- 96 tests, génération des types Next.js 16.4.3, TypeScript et lint ciblé validés localement. Le lanceur est `node --import tsx --test src/lib/*.test.ts` : le CLI tsx ne peut pas ouvrir son socket IPC dans cet environnement.
- Le build local n'a pas été tenté après le refus automatique précédent lié à l'envoi Sentry. Le build est à contrôler via la CI habituelle de PR, avec ses résultats indiqués dans la description.
- Le projet/team Vercel a été revérifié : sa dernière production READY `dpl_4qhk1Mk6F97j4BGCciVpmJwfV7H6` correspond au même dépôt et au commit de base. Aucun log error/fatal ni cluster d'erreur n'a été retourné sur 2026-10-30 18:15:42–19:05:42 UTC (14:15–15:05 à Montréal); cette absence sur une fenêtre limitée ne prouve pas l'absence d'incident.
- Schéma des métriques Vercel consulté; la requête FOT a répondu HTTP 400, donc aucun gain réel plateforme n'a été mesuré. Aucun accès connecté à l'application n'a été utilisé. `/coach/observability` redirige vers `/coach`; l'observabilité actuelle est sous `/admin/observability`.

Après déploiement, comparer les compteurs existants `ServerRequestMetric.queryCount` et `resultBytes` pour les sauvegardes de même composition. Ces compteurs agrègent toute la requête HTTP, pas ce seul chargeur; tenir compte des autres lectures/écritures. Ne pas convertir leurs volumes en FOT. Aucun nouveau service ni nouvelle écriture de télémétrie n'est nécessaire à cette correction.
