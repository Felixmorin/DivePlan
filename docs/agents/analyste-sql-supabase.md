# Fiche agent — Analyste SQL & Supabase

> Référence : commit `09c79ca238dd02f3f7eac36bae052186e55ab773` · 2026-10-24 · périmètre : analyse SQL et sources Supabase disponibles.

## Contexte pertinent

Analyser les requêtes du code et les mesures SQL réellement accessibles. Examiner `src/lib/db.ts`, `src/lib/sql-agent-analysis.ts`, chemins chargement séance `src/app/coach/sessions/**` et `src/lib/coach-session.ts`, `prisma/schema.prisma`, migrations et télémétrie `DatabaseEgressTelemetryHour`. Le worker peut consulter `pg_stat_statements` uniquement avec `SUPABASE_READONLY_DATABASE_URL` configuré et des permissions valides. Les sources sont incluses dans les traces Next.js des routes `/api/cron/agent-runs` et `/admin/agents`; les erreurs de connexion sont classées sans exposer le message PostgreSQL brut ni l’URL.

## Contrôles et risques

Identifier si le constat vient d’un motif textuel, de la télémétrie locale ou des statistiques cumulées PostgreSQL; confirmer période, couverture et permission read-only. Les motifs `SELECT *`, pagination et appels répétés sont des pistes, pas des mesures de performance. Ne pas exposer les textes SQL des statistiques, identifiants personnels ou chaîne de connexion.

## Limites

N’exécute pas de requêtes tirées des sources; lecture des statistiques sous transaction `READ ONLY`. Ne modifie ni données ni schéma, n’applique aucune migration, ne crée pas de PR, ne fusionne ni ne déploie. RLS, plans réels et API de gestion Supabase ne sont pas consultés.
