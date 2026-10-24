# Agents IA administrés

## Mise en service

Appliquer les migrations `db/migrations/0011_ai_agents.sql`, `db/migrations/0012_sql_supabase_analyst.sql`, `db/migrations/0013_ai_agent_run_cancellation.sql`, `db/migrations/0014_architecture_cartographer.sql`, `db/migrations/0015_ai_agent_order.sql`, `db/migrations/0016_pr_consolidation.sql` et `db/migrations/0017_ai_agent_workflows.sql` à la base PostgreSQL visée avant de déployer l’application. Elles créent le registre et la file des exécutions, les agents disponibles, l’ordre d’affichage, l’espace de revue des PR et le lien de séquencement des workflows.

Le bouton « Start workflow » met en file, dans l’ordre affiché, tous les agents actifs dont le déclenchement à la demande est activé. Les exécutions sont conservées individuellement dans `AiAgentRun` et le worker attend la fin de chaque étape avant de traiter la suivante. Les agents déjà en cours sont ignorés et affichés dans le message de lancement. Le workflow reste asynchrone : son traitement dépend du prochain appel de Vercel Cron.

## Architecte-cartographe

L’agent lancé depuis `/admin/agents` inventorie les sources déployées lisibles (`src/app`, `src/components`, `src/lib`, authentification, schéma Prisma et migrations), repère les pages/API, modèles et gardes d’accès, puis compare le commit à son exécution précédente. Le résultat conserve commit, date, diagrammes Mermaid, faits, déductions/limites et informations manquantes dans `AiAgentRun.result`. La console admin permet de consulter le dernier rapport et ses diagrammes. Il n’exécute pas le SQL découvert et ne lit pas les secrets.

Les documents versionnés de référence sont `docs/architecture/architecture.md` et `docs/agents/`; la console permet de les consulter sous `/admin/agents/context`. Les exécutions sur Vercel ne peuvent pas écrire dans le dépôt déployé : elles mettent donc à jour l’historique PostgreSQL, pas ces fichiers versionnés. Réviser et committer les guides du dépôt pour changer la référence partagée.

Le traitement des exécutions utilise une file PostgreSQL et la route Vercel Cron `/api/cron/agent-runs`. Définir `CRON_SECRET` dans les environnements de production Vercel; la route vérifie l’en-tête Bearer et ne traite que cinq demandes en attente par invocation. Les exécutions sont réclamées avec `FOR UPDATE SKIP LOCKED`, puis leur résultat ou leur erreur est persisté. Les rapports de cette première livraison sont des synthèses déterministes, pas une génération par LLM. Les agents créés depuis la console restent à l’état « Configuration requise » tant qu’aucun exécuteur spécifique n’est développé.

La fréquence quotidienne `0 0 * * *` est compatible avec le plan Hobby; sur Hobby, Vercel peut la déclencher à n’importe quel moment de l’heure UTC prévue. Le bouton « Exécuter maintenant » lance désormais le worker dans la même action serveur après avoir ajouté la demande à la file; le cron reste un filet de sécurité pour les exécutions planifiées ou interrompues. Vercel Cron ne s’exécute que sur les déploiements de production.

## Analyste SQL & Supabase

L’agent prend en charge le scan statique des appels SQL dans `src/app`, `src/lib` et les migrations, ainsi que les schémas PostgreSQL/Prisma inclus au déploiement. Il signale les `SELECT *`, les lectures sans pagination visible, les écritures avec `RETURNING *` et des accès SQL potentiellement répétés. Il traite spécialement les accès du détail de séance `/coach/sessions/:id`. Ce sont des constats de code ou des hypothèses; ils ne mesurent pas la durée réelle d’une requête.

Les mesures observées proviennent de `DatabaseEgressTelemetryHour`, la télémétrie de résultats SQL déjà collectée par DivePlan, et, si une connexion est configurée, des compteurs `pg_stat_statements`. La télémétrie interne couvre les données présentes dans sa table et peut ne pas correspondre à tout l’egress facturé par Supabase. L’API de gestion Supabase et les politiques RLS ne sont pas connectées. Le rapport affiche les sources réellement disponibles et les limites de chaque piste d’index.

Les lectures de télémétrie passent dans une transaction PostgreSQL `READ ONLY` avec un délai de requête de huit secondes. Le code déployé est inclus dans la trace du worker pour permettre le scan sans commande shell ni exécution de code fourni par l’interface. La file et les rapports restent gérés par l’application. Pour connecter les statistiques, définir `SUPABASE_READONLY_DATABASE_URL` dans l’environnement serveur avec une connexion dédiée à un hôte Supabase et un rôle en lecture seule autorisé à lire `pg_stat_statements` et `pg_stat_statements_info`. L’interface ne reçoit que l’état configuré, jamais l’URL ni le mot de passe. Le worker vérifie l’extension et les permissions à chaque exécution; les requêtes SQL stockées par l’extension ne sont jamais récupérées ni affichées.

Les statistiques `pg_stat_statements` sont des compteurs cumulés depuis leur dernière réinitialisation, pas des données filtrées sur 24 heures ou 7 jours. Le choix de période s’applique à la télémétrie d’egress DivePlan; les rapports identifient séparément la période cumulée Supabase et l’heure de remise à zéro lorsqu’elle est disponible. Sans `SUPABASE_READONLY_DATABASE_URL`, ou si l’extension/les permissions manquent, l’analyse locale continue et l’état affiche « Configuration requise » ou l’accès à valider.

Les lancements manuels proposent 24 heures ou 7 jours; la période est persistée sur l’exécution. Le déclenchement à la demande utilise la file existante. Les déclencheurs planifié, après déploiement et sur incident/egress restent désactivés et signalés « Configuration requise » puisqu’aucun producteur par agent n’est connecté. L’agent n’applique aucune modification à la base et ne déploie rien.

## Sources et limites de l’agent Observabilité

Le rapport analyse en lecture seule, sur les sept derniers jours, `PerformanceTelemetryHour`, `TransferTelemetryHour` et les types d’événement `AppEvent` contenant `error`, `exception` ou `failed`. Il affiche la période, les sources, les faits observés, les limites/hypothèses et des recommandations. Les Web Vitals n’apparaissent que si des échantillons ont été collectés.

L’application n’a pas de connecteur d’erreurs Sentry, de source de commits/déploiements, ni de flux complet d’exceptions. Le Sentry DSN seul n’est pas utilisé pour consulter des événements; aucun rapport ne prétend donc mesurer les erreurs serveur exhaustives ou relier une régression à un changement récent. Le code, les journaux bruts des fournisseurs et les secrets ne sont pas accessibles à cet agent. Les déclencheurs planifiés, après déploiement et sur incident restent désactivés et signalés comme non connectés. Aucun modèle d’IA externe n’est configuré; les rapports sont des synthèses déterministes des métriques disponibles.

Les modifications d’agents, les changements de déclencheurs, les créations et les demandes d’exécution sont inscrits dans `AppEvent`. Les rapports ne peuvent déclencher ni fusion ni déploiement.
