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
npm run db:seed:pilot
npm run dev
```

Ouvrir `http://localhost:3000`.

## Routes principales

- Coach: `/coach`, `/coach/planning`, `/coach/sessions`, `/coach/sessions/new`, `/coach/athletes`, `/coach/groups`, `/coach/library`, `/coach/templates`
- Athlete: `/athlete`, `/athlete/week`, `/athlete/progress`, `/athlete/skills`, `/athlete/profile`

Les routes dynamiques `/coach/sessions/[id]`, `/coach/sessions/[id]/edit`, `/coach/sessions/[id]/print` et `/athlete/session/[id]` sont preparees. Les routes demo sont locales et opt-in; elles retournent 404 sauf si `NEXT_PUBLIC_ENABLE_DEMO_ROUTES=true`.

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
- `npm run prisma:migrate:deploy`: applique les migrations en production
- `npm run db:seed:pilot`: prepare un club pilote non destructif
- `npm run db:seed`: insere les donnees de demonstration en vidant les tables applicatives

## Deploiement Vercel

Configurer `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY` et `INVITATION_EMAIL_FROM` dans Vercel, puis deployer le projet. `INVITATION_EMAIL_REPLY_TO` est optionnel. Le script `postinstall` genere Prisma Client automatiquement et `npm run prisma:migrate:deploy` applique les migrations contre la base PostgreSQL cible.

## Emails transactionnels

Les invitations coach envoient le lien d'activation via Resend. En local, aucun email n'est envoye par defaut: l'interface affiche le lien a copier et marque l'envoi comme ignore localement. Pour tester un vrai envoi local, definir `RESEND_API_KEY`, `INVITATION_EMAIL_FROM` et `INVITATION_EMAIL_SEND_IN_DEVELOPMENT=true`.

En production, verifier le domaine d'envoi dans Resend avant d'utiliser une adresse `INVITATION_EMAIL_FROM` du club ou de DivePlan.

## Acces pilote

Le chemin recommande pour un test club est l'invitation par lien: le coach cree une invitation, copie le lien d'activation, puis l'athlete choisit son mot de passe et arrive dans son espace. Le seed pilote donne aussi des comptes prets si le test doit demarrer sans invitations.

- En local, le code par defaut est `diveplan-demo` si `PILOT_ACCESS_CODE` n'est pas defini.
- En production, definir obligatoirement `PILOT_ACCESS_CODE`.
- Pendant le pilote, garder `NEXT_PUBLIC_ENABLE_DEMO_ROUTES=false`.
- Comptes seed pilote utiles: `coach.pilote@diveplan.local`, `emma.pilote@diveplan.local`, `leo.pilote@diveplan.local`, `mia.pilote@diveplan.local`.
- Mot de passe seed pilote: `diveplan-pilot`, surchargeable avec `PILOT_SEED_PASSWORD`.
- Le seed demo historique reste disponible avec `npm run db:seed`: `coach@diveplan.local` et `emma@diveplan.local` / `diveplan-demo`.

Voir `SELLABLE_CHECKLIST.md` pour le chemin restant vers une version vendable en pilote club.
