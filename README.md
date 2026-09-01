# DivePlan

Application SaaS Next.js pour clubs de plongeon et entraineurs. La V1 livre une experience navigable avec dashboard coach, planning hebdomadaire, builder de seance, assignations flexibles par bloc, vue athlete mobile, player de seance, progression et mode impression.

## Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS
- shadcn/ui style components
- PostgreSQL + Prisma ORM
- Auth.js / NextAuth v5 compatible
- Recharts
- Lucide Icons
- React Hook Form + Zod

## Installation

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
npm run dev
```

Ouvrir `http://localhost:3000`.

## Routes principales

- Coach: `/coach`, `/coach/planning`, `/coach/sessions`, `/coach/sessions/new`, `/coach/sessions/demo`, `/coach/sessions/demo/print`, `/coach/athletes`, `/coach/groups`, `/coach/library`, `/coach/templates`
- Athlete: `/athlete`, `/athlete/week`, `/athlete/session/demo`, `/athlete/progress`, `/athlete/skills`, `/athlete/profile`

Les routes dynamiques `/coach/sessions/[id]`, `/coach/sessions/[id]/edit`, `/coach/sessions/[id]/print` et `/athlete/session/[id]` sont preparees.

## Modele d'assignation

DivePlan ne code jamais les entrainements directement sur l'athlete. Une seance contient des `SessionBlock`, et chaque bloc est relie aux athletes via `SessionBlockAssignment`.

Cela supporte:

- 1 bloc vers 1 athlete
- 1 bloc vers plusieurs athletes
- 1 bloc vers tout un groupe via assignations explicites
- plusieurs blocs differents dans une meme seance pour des athletes differents

Le seed Club Mustang demontre:

- Emma + Leo partagent le meme dryland
- Charles a un dryland individuel
- Emma a un entrainement piscine different de Charles
- Juliette + Alice partagent le meme entrainement piscine
- Les sections 1 m et 3 m vivent dans un seul bloc `POOL`

## Scripts

- `npm run dev`: demarre Next.js
- `npm run build`: build de production
- `npm run start`: serveur production
- `npm run lint`: ESLint
- `npm run prisma:generate`: genere Prisma Client
- `npm run prisma:migrate`: applique les migrations
- `npm run db:seed`: insere les donnees de demonstration

## Deploiement Vercel

Configurer `DATABASE_URL`, `AUTH_SECRET` et `AUTH_URL` dans Vercel, puis deployer le projet. Executer les migrations Prisma contre la base PostgreSQL cible avant usage.

## Acces pilote

Le MVP utilise un login par email + mot de passe. Le code pilote reste disponible pour faciliter les demos locales.

- En local, le code par defaut est `diveplan-demo` si `PILOT_ACCESS_CODE` n'est pas defini.
- En production, definir obligatoirement `PILOT_ACCESS_CODE`.
- Comptes seed utiles: `coach@diveplan.local` et `emma@diveplan.local`.
- Mot de passe seed: `diveplan-demo`.

Voir `SELLABLE_CHECKLIST.md` pour le chemin restant vers une version vendable en pilote club.
