# Fiche agent — Analyste SQL & Supabase

> Mode actuel : Codex local, lancé par le runner DivePlan.

## Contexte pertinent

Codex analyse localement le SQL du dépôt, les accès de données dans `src/app` et `src/lib`, `prisma/schema.prisma` et les migrations SQL. Il repère les lectures répétées, les volumes potentiellement excessifs, les risques N+1, les pistes d’index déclarées et les duplications. Depuis Admin → Agents, le bouton « Démarrer l’analyse Codex » met la demande en file pour le runner local.

Installer le runner une fois, depuis la racine du dépôt :

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-nextjs-analysis-runner.ps1
```

Le rapport complet est conservé sous `logs/sql-supabase-analysis/`. DivePlan ne reçoit que l’état de l’exécution et le chemin du rapport afin d’afficher l’historique.

## Contrôles et risques

Séparer les faits lisibles dans le code et les hypothèses de coût. Vérifier les appels autour des boucles, les références, les filtres et index présents dans le dépôt. Un index manquant du dépôt peut exister en production; les plans d’exécution et volumes réels ne sont pas observés par ce rapport.

## Limites

L’analyse est statique et locale. Aucun SQL n’est exécuté; aucune base Supabase/PostgreSQL, statistique de production, politique RLS effective, facture ou plan d’exécution n’est consulté. Codex tourne avec `--sandbox read-only --ephemeral`; le runner ne modifie pas le dépôt et n’applique pas de migrations. Le rapport n’avance aucun montant d’économie. Aucune clé API ni rapport complet n’est envoyé à DivePlan.
