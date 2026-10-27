# Fiche agent — Analyste SQL & Supabase

> Mode actuel : Codex local, lancé par le runner DivePlan.

## Contexte pertinent

Codex analyse localement le SQL du dépôt, les accès de données dans `src/app` et `src/lib`, `prisma/schema.prisma` et les migrations SQL. Il repère les lectures répétées, les volumes potentiellement excessifs, les risques N+1, les pistes d’index déclarées et les duplications. Depuis Admin → Agents, le bouton « Démarrer l’analyse Codex » met la demande en file pour le runner local.

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

L’analyse du code reste statique et locale. Aucun SQL n’est exécuté et aucune base Supabase/PostgreSQL n’est contactée. Codex reçoit les nombres et le SQL normalisé saisis dans le fichier de métriques; les commentaires SQL sont retirés avant transmission pour écarter notamment des identifiants de session. Vérifie le contenu avant l’envoi, car les requêtes peuvent révéler des détails internes. L’agent ne consulte pas les politiques RLS effectives, factures ou plans d’exécution. Codex tourne avec `--sandbox read-only --ephemeral`; le runner ne modifie pas le dépôt et n’applique pas de migrations. Le rapport n’avance aucun montant d’économie. Aucune clé API ni rapport complet n’est envoyé à DivePlan.
