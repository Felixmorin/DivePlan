# DivePlan

DivePlan est une application SaaS pour les clubs de plongeon et leurs entraîneurs. Elle centralise la planification, la création et l’exécution des séances, tout en donnant aux athlètes une vue simple de leur calendrier, de leurs exercices et de leur progression.

La version actuelle est une V1 fonctionnelle orientée pilote club.

## Fonctionnalités

### Pour les entraîneurs

- Tableau de bord du club et suivi de l’activité.
- Planning hebdomadaire et calendrier d’événements : entraînements, compétitions et événements individuels ou de groupe.
- Création et modification de séances avec blocs piscine et dryland.
- Assignation flexible d’un bloc à un ou plusieurs athlètes.
- Bibliothèque d’exercices dryland avec catégories, équipement, séries, répétitions, durée, tags et notes coach.
- Bibliothèque de séances et templates réutilisables.
- Gestion des athlètes, groupes et plongeons de compétition.
- Vue monitoring des séances et de leur état.
- Impression d’une séance pour utilisation au bord de la piscine.

### Pour les athlètes

- Accueil du jour, calendrier et vue de la semaine.
- Player de séance avec progression bloc par bloc.
- Validation des exercices et des plongeons réalisés.
- Feedback par bloc et commentaire final.
- Historique de progression et suivi des compétences.
- Profil et changement de mot de passe à la première connexion.

## Stack technique

- Next.js 16 avec App Router
- React 19 et TypeScript
- Tailwind CSS 4 et composants de style shadcn/ui
- PostgreSQL avec Prisma ORM
- Auth.js / NextAuth v5 compatible
- Recharts et Lucide Icons
- React Hook Form et Zod

## Prérequis

- Node.js compatible avec Next.js 16
- PostgreSQL accessible depuis l’environnement d’exécution
- npm

## Installation locale

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run db:seed:pilot
npm run dev
```

Ouvrir ensuite [http://localhost:3000](http://localhost:3000).

Sous PowerShell, remplacer `cp .env.example .env` par :

```powershell
Copy-Item .env.example .env
```

## Variables d’environnement

Les variables suivantes sont définies dans `.env.example` :

| Variable | Utilisation |
| --- | --- |
| `DATABASE_URL` | URL de connexion PostgreSQL |
| `AUTH_SECRET` | Secret de session Auth.js |
| `AUTH_URL` | URL publique de l’application utilisée par l’authentification |
| `NEXT_PUBLIC_APP_URL` | URL publique de l’application côté client |
| `PILOT_ACCESS_CODE` | Code d’accès privé du pilote |
| `PILOT_SEED_PASSWORD` | Mot de passe du seed pilote ; facultatif |
| `NEXT_PUBLIC_ENABLE_DEMO_ROUTES` | Active les routes de démonstration lorsqu’il vaut `true` |
| `CRON_SECRET` | Secret attendu par l’endpoint de clôture automatique |

En développement, l’authentification conserve un compte de démonstration de secours : `coach@diveplan.local` avec le mot de passe `diveplan-demo`.

## Routes principales

### Entraîneur

- `/coach` : tableau de bord
- `/coach/planning` : planning et calendrier
- `/coach/sessions` : séances
- `/coach/sessions/new` : nouvelle séance
- `/coach/athletes` : athlètes
- `/coach/groups` : groupes
- `/coach/library` : bibliothèque dryland
- `/coach/templates` : templates de séances
- `/coach/monitoring` : monitoring
- `/coach/settings` : paramètres

Les routes dynamiques de séance sont disponibles via `/coach/sessions/[id]`, `/coach/sessions/[id]/edit` et `/coach/sessions/[id]/print`.

### Athlète

- `/athlete` : séance du jour
- `/athlete/calendar` : calendrier
- `/athlete/week` : semaine
- `/athlete/session/[id]` : player de séance
- `/athlete/progress` : progression
- `/athlete/skills` : compétences
- `/athlete/profile` : profil

## Modèle d’assignation

Une séance n’est pas codée directement sur un athlète. Elle contient des `SessionBlock`, et chaque bloc est relié aux athlètes par `SessionBlockAssignment`.

Ce modèle permet notamment :

- d’assigner un bloc à un seul athlète ou à plusieurs athlètes ;
- de composer une séance commune avec des variantes individuelles ;
- de garder les sections 1 m et 3 m dans un même bloc piscine ;
- de suivre séparément les validations et le feedback de chaque athlète.

## Données de démonstration

Le seed pilote est non destructif et peut être relancé :

```bash
npm run db:seed:pilot
```

Comptes pilotes :

- Entraîneur : `coach.pilote@diveplan.local`
- Athlètes : `emma.pilote@diveplan.local`, `leo.pilote@diveplan.local`, `mia.pilote@diveplan.local`
- Mot de passe par défaut : `diveplan-pilot`

Le mot de passe peut être remplacé avec `PILOT_SEED_PASSWORD`. En production, définir également `PILOT_ACCESS_CODE` et laisser `NEXT_PUBLIC_ENABLE_DEMO_ROUTES=false`.

Le seed de démonstration historique est disponible avec :

```bash
npm run db:seed
```

Attention : ce seed vide les tables applicatives avant de recréer les données de démonstration.

## Scripts npm

```text
npm run dev                    Démarre le serveur de développement
npm run build                  Génère le build de production
npm run start                  Démarre le serveur de production
npm run lint                   Lance ESLint
npm run test                   Lance les tests unitaires
npm run prisma:generate        Génère Prisma Client
npm run prisma:migrate         Crée/applique une migration en développement
npm run prisma:migrate:deploy  Applique les migrations en production
npm run db:seed:pilot          Prépare les données du pilote sans nettoyage destructif
npm run db:seed                Recrée les données de démonstration
```

## Déploiement sur Vercel

Configurer `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `PILOT_ACCESS_CODE` et `CRON_SECRET` dans Vercel. Le script `postinstall` génère Prisma Client et `prebuild` exécute `prisma migrate deploy` avant le build de production.

Un cron Vercel appelle `/api/cron/complete-sessions` chaque jour à minuit UTC pour clôturer automatiquement les séances arrivées à échéance. L’endpoint exige l’en-tête `Authorization: Bearer <CRON_SECRET>`.

## État du projet

La V1 couvre le parcours principal entraîneur → séance → athlète → progression. Pour les éléments encore nécessaires à une commercialisation plus large, consulter [SELLABLE_CHECKLIST.md](SELLABLE_CHECKLIST.md).
