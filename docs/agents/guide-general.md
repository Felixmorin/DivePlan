# Contexte DivePlan pour les agents

> Référence : commit `09c79ca238dd02f3f7eac36bae052186e55ab773` · 2026-10-24 · périmètre : sources de l’application, services, schéma et migrations du dépôt. Guide vérifié dans le code et la documentation. Voir [carte d’architecture](../architecture/architecture.md).

## Modules et parcours

- Coach : planning des entraînements/événements; construction des séances et blocs; assignation aux athlètes; groupes, profils, listes de plongeons, bibliothèque dryland et templates.
- Athlète : calendrier et séance assignée; suivi bloc par bloc, plongeons/exercices, feedback, progression, compétences, profil et absence.
- Admin : gestion des accès coach, monitoring agrégé et console agents.
- Les pages se trouvent dans `src/app/coach`, `src/app/athlete`, `src/app/admin`; API sous `src/app/api`; logique partagée dans `src/lib`.

## Rôles et permissions observés

`UserRole` dans `prisma/schema.prisma` définit `ADMIN`, `COACH`, `ATHLETE`. `src/lib/current-user.ts` implémente les gardes `requireAdmin`, `requireCoach` et `requireAthlete`. Le coach est associé à un club; un athlète doit posséder un profil, un club et un mot de passe défini. La console Agents est admin seulement. Vérifier aussi les Server Actions et Route Handlers ciblés avant de conclure sur un contrôle d’accès. Les rôles SQL et RLS en production ne sont pas représentés complètement dans le dépôt.

## Règles métier confirmées

- Les séances contiennent des blocs; les athlètes sont assignés aux blocs (`SessionBlockAssignment`). Les blocs piscine portent sections/records de plongeons; dryland référence la bibliothèque avec valeurs ajustables.
- Les séances sont rattachées à une semaine et les événements du calendrier sont gérés séparément (`TrainingWeek`, `TrainingSession`, `PlanningEvent`).
- Invariant multi-club : le club de `TrainingWeek` doit correspondre à celui de son `TrainingGroup`; les athlètes affectés à un bloc doivent appartenir au club de la semaine et au groupe de celle-ci. Les Server Actions qui créent ou modifient les séances doivent filtrer les ressources par `clubId` dérivé de `requireCoach()` et valider les athlètes actifs du groupe avant l'écriture. Les relations Prisma simples ne garantissent pas seules cet invariant; les autres routes/services qui lisent ou écrivent ces relations doivent appliquer le même contrôle.
- L’agent Observabilité envoie à Codex local uniquement des agrégats non nominatifs de télémétrie. Codex produit une synthèse structurée enregistrée dans l’historique des exécutions; aucune source d’erreurs exhaustive ou de déploiements n’est connectée.
- Les agents Analyse du code Next.js et Analyste SQL & Supabase utilisent Codex local en lecture seule; leurs rapports complets restent sur le poste du runner.
- L’agent Architecte-cartographe crée une cartographie déterministe des sources déployées, puis Codex lit le dépôt local en lecture seule pour vérifier les références et enrichir la synthèse. Le rapport compare le commit local et les modifications locales au commit déployé; il distingue les preuves de l’inventaire et les observations locales.
- L’Analyste du code Next.js utilise Codex local en lecture seule pour examiner le code applicatif, ses références et sa lisibilité. Il exclut explicitement toute analyse SQL et produit un rapport local sous `logs/`.

## Dépendances sensibles et conventions

- PostgreSQL via `pg` et `src/lib/db.ts`; changements de schéma via migrations SQL/Prisma relues et appliquées explicitement.
- Auth.js v5 credentials; secrets uniquement serveur. Ne jamais inclure valeurs `.env`, mots de passe, URLs de connexion, clés, données personnelles ou contenu de journaux nominatif dans les rapports.
- Supabase Storage est réservé aux avatars; bucket privé, URL signées temporaires.
- Web Push facultatif; Vercel Cron est configuré dans `vercel.json`; `CRON_SECRET` protège ses routes.
- Next.js App Router : pages/layouts dans `src/app`, endpoints `route.ts`, Server Actions en module `"use server"`. Garder la vérification d’accès côté serveur.
- Tests disponibles sous `src/**/*.test.ts`; ne pas les présenter comme preuve de parcours complet.

## Limites

Le dépôt n’établit pas l’état réel des migrations appliquées, les politiques RLS, les variables déployées, les événements Sentry, les plans SQL de production ou le comportement observé sous charge. Séparer dans tout rapport **fait vérifié**, **déduction** et **à confirmer** et citer les chemins/éléments probants. Documenter l’absence d’accès. Ne jamais inventer intégrations, permissions, tables ou comportements.
