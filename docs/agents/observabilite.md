# Fiche agent — Observabilité DivePlan

> Référence : commit `09c79ca238dd02f3f7eac36bae052186e55ab773` · 2026-10-24 · périmètre : observabilité et agent configurés dans le dépôt.

## Contexte pertinent

L’agent lit les agrégats disponibles pour relever volume, Web Vitals et événements applicatifs. Références : `src/lib/agent-worker.ts`, `src/lib/monitoring.ts`, `src/app/admin/observability/`, `src/app/coach/monitoring/`, migrations `0002` à `0005` et `docs/transfer-monitoring.md`.

## Contrôles et risques

Vérifier la période et les sources retournées dans chaque rapport; distinguer agrégats absents des valeurs nulles; ne pas présenter AppEvent comme flux complet d’erreurs, ni les moyennes de vitals comme percentiles. Sentry et les commits/déploiements ne sont pas consultés par cet agent.

## Limites

Lecture des agrégats disponibles uniquement. Ne peut pas lire les journaux fournisseurs, secrets, données nominatives, modifier le code, déclencher une fusion ou un déploiement. Signaler l’absence d’une source et toute conclusion causale comme non vérifiée.
