# Éviter le deuxième rafraîchissement des actions de séance

Base : master `c84f571033ac5ee8996a92ce9c1b5e010600d0a1` (PR #77, #78 et #79 fusionnées).

## Surcharge et correction

Les seuls usages actuels de ToastActionForm sont dans `/coach/sessions/:id` : publier une séance, démarrer une séance publiée et marquer un athlète terminé. Chacune des trois Server Actions appelle déjà `revalidatePath` sur cette page précise avant de revenir. ToastActionForm appelait ensuite `router.refresh()`.

Le guide Server Actions du Next installé 16.4.3, `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, décrit que cette invalidation inclut les données et le rendu actualisé dans la réponse de l’action. Le second refresh demande donc un autre rafraîchissement du même arbre. Il est supprimé du formulaire; les actions conservent leurs mutations et invalidations.

Le contrat du composant indique désormais qu’une action fournie doit invalider sa page. Aucun appelant actuel sans invalidation. Aucune modification de design, de statut, de contrôle d’accès, de cache partagé, de présence ou d’écriture de résultats. Les notifications et le comportement en attente/erreur sont conservés.

## Preuve synthétique

`node --import tsx --test src/lib/coach-action-refresh.test.ts`

Le test exécute le vrai composant avec hooks/navigation/toast contrôlés, puis les trois vraies fonctions d’action extraites par AST. Leurs SQL de lecture/écriture et transactions sont exécutés dans PGlite, ainsi que la vraie fonction `completeSessionIfAllAthletesAreDone`. Identité, invalidation Next.js, push et suivi d’événements sont simulés; aucun message externe n’est envoyé. Le test n’exécute pas le protocole Flight ou un navigateur connecté.

Même scénario avant/après, un passage par action :

| Par action réussie | Avant | Après |
|---|---:|---:|
| Mutations métier effectuées | 1 | 1 |
| Invalidation de `/coach/sessions/session-a` par l’action | 1 | 1 |
| Appels client à router.refresh après l’action | 1 | 0 |

Les trois régressions échouent avant correction sur le dernier compteur, après succès des assertions de persistance/invalidation/notification. Après : statut DRAFT → READY → IN_PROGRESS → COMPLETED, sans second refresh. Vérifiés aussi : première heure de début conservée, ressenti/note, 7 répétitions et 2 golden reps, exercice terminé, absence conservée et clôture du groupe avec athlète absent; refus hors club, athlète non assigné et coach non autorisé, toast d’erreur et fin d’attente; formulaire rendu en attente qui n’invoque pas une seconde action.

Le gain mesuré est un appel de refresh évité dans le composant, pas un relevé réseau. Le rendu actualisé dans la réponse de mutation relève du contrat Next.js documenté. Aucun nombre réel de requêtes HTTP/SQL évitées, durée ou économie de facture n’est revendiqué. Fast Origin Transfer CDN/compute, transferts navigateur, volume PostgreSQL, taille HTTP HTML/RSC/JSON et fichiers JavaScript sont des mesures distinctes et ne sont pas chiffrés ici.

## Observabilité et limites

Le 2 novembre 2026, projet/team/domaine dive-plan.vercel.app et lien Git Felixmorin/DivePlan reconfirmés via connecteurs. Production examinée READY `dpl_3VWNBj6wJzMnMQfK74j5N8znbxf5`, commit de base. Aucun log error/fatal sur **11:15:25–12:05:25 UTC (06:15:25–07:05:25 Montréal)** ni cluster d’erreur sur 50 minutes; cette absence ne prouve pas l’absence d’incident ou l’utilisation du parcours.

Catalogue de métriques Vercel découvert avant requête; FOT sortant indisponible HTTP 400, CLI Vercel absente. `/coach/observability` redirige vers `/coach`. Instrumentation SQL/request existante inspectée; pas d’accès applicatif connecté ni données privées consultées. Aucune nouvelle collecte nécessaire pour prouver le deuxième appel explicite. Les compteurs existants sont préférables pour vérifier le gain réel après déploiement.

Après déploiement habituel : publier puis démarrer une séance de test autorisée et marquer un athlète terminé, vérifier l’interface actualisée et le toast, puis comparer les appels document/RSC et compteurs SQL autour de chaque mutation. Parcours navigateur connecté/mobile/iPad non testé ici.

Aucune migration, dépendance, fusion ou action production. Aucun fichier commun avec la PR de design coach #68 ouverte lors de la vérification; ses actions serveur restent un contrat à conserver lors des évolutions futures.
