# Fiche agent — Observabilité DivePlan

> Référence : commit `09c79ca238dd02f3f7eac36bae052186e55ab773` · 2026-10-24 · périmètre : observabilité et agent configurés dans le dépôt.

## Contexte pertinent

Le serveur sélectionne les agrégats de Web Vitals, volumes de transfert par route et décomptes de types d’événements, puis les transmet au runner Codex local. Codex produit une synthèse structurée conservée dans l’historique de l’agent; le runner en garde aussi une copie locale. Il n’accède pas au code ni aux journaux fournisseurs. Références : `src/app/api/agent-code-analysis/queue/claim/route.ts`, `scripts/analyze-observability.ps1`, `src/lib/monitoring.ts`, `src/app/admin/observability/`, migrations `0002` à `0005` et `docs/transfer-monitoring.md`.

## Contrôles et risques

Vérifier la période et les sources retournées dans chaque rapport; distinguer agrégats absents des valeurs nulles; ne pas présenter AppEvent comme flux complet d’erreurs, ni les moyennes de vitals comme percentiles. Sentry et les commits/déploiements ne sont pas consultés par cet agent.

## Limites

Lecture des agrégats disponibles uniquement. Ne peut pas lire les journaux fournisseurs, secrets, données nominatives, modifier le code, déclencher une fusion ou un déploiement. Signaler l’absence d’une source et toute conclusion causale comme non vérifiée.
