# Fiche agent — Analyste SQL & Supabase

## Dernier rapport

**27 octobre 2026** — [Rapport complet](../../logs/sql-supabase-analysis/analysis-20261027-012412-0c23024b.md) (audit statique, statistiques `pg_stat_statements` fournies manuellement).

- Priorités à vérifier : index effectif sur `PoolDive(poolSectionId, order)`; agrégations complètes de l’historique `AthleteDiveLog`; coût de reconstruction JSON et du hash ETag pour les séances live (Q77).
- Le code observé regroupe les lectures par séance et ne montre pas de preuve solide de N+1 dans les parcours examinés.
- Les requêtes `SELECT *` et listes `AiPrProposal` lentes des statistiques n’ont pas été attribuées avec certitude à du code actuel.
- Les index de production, plans, RLS et coûts réels n’ont pas été observés; vérifier dans Supabase avant toute modification.

> Mode actuel : Codex local, lancé par le runner DivePlan.

## Contexte pertinent

Codex analyse localement le SQL du dépôt, les accès de données dans `src/app` et `src/lib`, `prisma/schema.prisma` et les migrations SQL. Il repère les lectures répétées, les volumes potentiellement excessifs, les risques N+1, les pistes d’index déclarées et les duplications. Depuis Admin → Agents, le bouton « Démarrer l’analyse Codex » met la demande en file pour le runner local.

### Connecter un audit PostgreSQL en lecture seule

Sur le compte Windows qui exécute le runner, lancer :

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\set-sql-audit-connection.ps1
```

Fournir une chaîne PostgreSQL pour un rôle dédié sans privilèges d’écriture. Le secret est saisi sans affichage et stocké par DPAPI dans `%LOCALAPPDATA%\DivePlan\sql-audit-connection.dpapi`. Le runner appelle `scripts/audit-postgres.mjs` avant Codex. Le script exécute seulement des `SELECT` dans une transaction `READ ONLY`, limite chaque requête de catalogue à 12 secondes et ferme la connexion avant de lancer Codex.

Le relevé contient les clés étrangères sans index BTREE couvrant les colonnes dans leur ordre, les index publics à zéro scan avec leur taille et le compteur de remise à zéro des statistiques, les tables publiques avec RLS sans politique, les métadonnées des politiques, et la définition/privilèges/event triggers de `public.rls_auto_enable()`. Il ne lit aucune ligne de table métier, ne consulte pas le texte des requêtes `pg_stat_statements`, ne lit pas `.env` et n’envoie jamais l’URL de connexion. Codex reçoit ces métadonnées seulement si la connexion DPAPI existe. Sans celle-ci, il fait l’analyse statique habituelle.

Le rôle est à créer dans la base cible avec la politique d’accès minimale de votre fournisseur. Ne réutilise pas le compte administrateur ou le compte de production de l’application. Si la chaîne doit être remplacée, relancer le script de configuration; pour désactiver la source, supprimer le fichier DPAPI sous le compte Windows du runner.

Installer le runner une fois, depuis la racine du dépôt :

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-nextjs-analysis-runner.ps1
```

Le rapport complet est conservé sous `logs/sql-supabase-analysis/`. DivePlan ne reçoit que l’état de l’exécution et le chemin du rapport afin d’afficher l’historique.

### Ajouter des statistiques `pg_stat_statements`

Le runner crée `logs/sql-supabase-analysis/metrics-input.csv` au premier lancement de l’agent SQL. Le JSON fourni par l’administrateur a été converti en 100 lignes dans ce fichier. Pour le remplacer, utilise les champs `calls`, `mean_exec_time`, `total_exec_time` et `query` copiés depuis Supabase, puis relance « Démarrer l’analyse Codex » dans Admin → Agents. Le runner transmet à Codex ces nombres et le texte SQL normalisé, mais jamais les identifiants de connexion.

```csv
period,calls,mean_exec_time_ms,total_exec_time_ms,query_label,normalized_query
since_reset,8423,7.74833055621512,65264.188275,Q1,"SELECT ..."
```

Remplace `SELECT ...` par le SQL complet de la cellule `query`. Si la requête contient des virgules, entoure tout le champ de guillemets doubles CSV; double chaque guillemet double à l’intérieur. Ajoute une ligne par requête et garde les colonnes dans cet ordre. Les lignes importées portent des étiquettes Q1–Q100, sans correspondance garantie avec le code source; elles suivent l’ordre du JSON fourni. Périodes permises : `24h`, `7d`, `since_reset` ou `unknown`. Les nombres décimaux doivent utiliser un point. L’étiquette doit être un repère de Q1 à Q999. Le fichier se trouve sous `logs/`, répertoire ignoré par Git. Le runner accepte au plus 100 requêtes et 12 000 caractères normalisés par requête.

Les compteurs de `pg_stat_statements` sont généralement cumulés depuis la dernière réinitialisation; indique `since_reset` si tu ne connais pas une fenêtre plus précise. Ces statistiques sont un instantané copié manuellement, pas un accès direct de l’agent à la base.

## Contrôles et risques

Séparer les faits lisibles dans le code et les hypothèses de coût. Vérifier les appels autour des boucles, les références, les filtres et index présents dans le dépôt. Un index manquant du dépôt peut exister en production; les plans d’exécution et volumes réels ne sont pas observés par ce rapport.

## Limites

L’analyse du code reste locale. Sans connexion DPAPI, aucune base n’est contactée; avec celle-ci, seul le script d’audit dédié exécute les lectures de catalogues dans une transaction `READ ONLY`. Les données envoyées à Codex peuvent révéler les noms d’objets et la définition de `rls_auto_enable()`, mais excluent les lignes métier, les textes de requête enregistrés, les secrets et les valeurs de `.env`. Les statistiques d’index peuvent avoir été réinitialisées et ne prouvent pas qu’un index est inutile. L’agent ne consulte pas les factures ou plans d’exécution. Codex tourne avec `--sandbox read-only --ephemeral`; le runner ne modifie pas le dépôt et n’applique pas de migrations. Le rapport n’avance aucun montant d’économie. Aucune clé API ni rapport complet n’est envoyé à DivePlan.
