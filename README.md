# DivePlan

DivePlan est une application web pour les clubs de plongeon. Elle aide les entraîneurs à planifier et préparer les séances, puis permet aux athlètes de consulter leur programme, d’enregistrer leur travail et de suivre leur progression.

Le produit est actuellement conçu pour des **pilotes accompagnés avec des clubs**. Le parcours principal est en place, mais l’inscription autonome des clubs, la facturation et plusieurs opérations de service restent à construire. Voir [SELLABLE_CHECKLIST.md](SELLABLE_CHECKLIST.md) pour le plan de préparation commerciale.

## Fonctionnalités disponibles

### Entraîneurs

- Tableau de bord, planning hebdomadaire et calendrier d’événements pour les entraînements, camps et compétitions.
- Création, modification, duplication, impression et suivi des séances.
- Séances composées de blocs d’échauffement, de dryland, de piscine, de retour au calme ou personnalisés.
- Assignation des blocs à un ou plusieurs athlètes, avec variantes individuelles.
- Bibliothèque dryland avec exercices, catégories, équipement, séries, répétitions, durée, tags et notes.
- Enregistrement d’une séance comme template, puis chargement du template dans une nouvelle séance.
- Gestion des athlètes, des groupes et de leurs listes de plongeons de compétition.
- Import d’athlètes et de groupes par CSV; création de comptes d’athlètes avec identifiant et mot de passe temporaire.
- Journal d’événements et indicateurs de suivi dans la page de monitoring.

### Athlètes

- Accueil avec séance du jour, calendrier et vue hebdomadaire.
- Player de séance avec suivi bloc par bloc.
- Validation des exercices et des plongeons, répétitions réalisées et répétitions « dorées ».
- Notes par plongeon, feedback par bloc et commentaire de fin de séance.
- Historique de progression, compétences, profil et changement du mot de passe temporaire.
- Déclaration d’absence à une séance.

## Limites connues

- Les comptes et les clubs sont préparés ou accompagnés par l’équipe; il n’y a pas encore de parcours complet d’inscription autonome.
- La création d’un compte athlète affiche les identifiants temporaires au coach. L’envoi d’invitations et la réinitialisation de mot de passe par courriel ne sont pas configurés.
- L’authentification utilise des identifiants et mots de passe; le SSO n’est pas intégré.
- La facturation, les abonnements et la gestion commerciale des clubs ne sont pas intégrés.
- Les sauvegardes managées, le monitoring externe et les procédures de soutien et de confidentialité doivent être définis pour une exploitation commerciale plus large, notamment avec des athlètes mineurs.
- La page Réglages permet de modifier l’identité du club, le compte du coach connecté, la vue par défaut du planning, le premier jour de la semaine et plusieurs options de la feuille imprimée. La gestion des accès des autres coachs reste à ajouter.

## Stack

- Next.js 16 avec App Router, React 19 et TypeScript
- Tailwind CSS 4 et composants d’interface inspirés de shadcn/ui
- PostgreSQL et Prisma ORM
- Auth.js / NextAuth v5 avec authentification par identifiants
- Recharts, Lucide, React Hook Form et Zod

## Prérequis

- Node.js pris en charge par Next.js 16
- PostgreSQL accessible depuis l’application
- npm

## Installation locale

1. Installer les dépendances :

   ```bash
   npm install
   ```

2. Créer le fichier d’environnement :

   ```bash
   cp .env.example .env
   ```

   Sous PowerShell :

   ```powershell
   Copy-Item .env.example .env
   ```

3. Configurer au minimum `DATABASE_URL` et `AUTH_SECRET` dans `.env`.

4. Générer le client Prisma, appliquer les migrations et charger les données du pilote :

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   npm run db:seed:pilot
   ```

5. Démarrer l’application :

   ```bash
   npm run dev
   ```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Variables d’environnement

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | URL de connexion PostgreSQL. |
| `AUTH_SECRET` | Secret de signature des sessions Auth.js. À définir avec une valeur forte en production. |
| `AUTH_URL` | URL de base de l’application utilisée par Auth.js selon l’environnement. |
| `NEXT_PUBLIC_APP_URL` | URL publique de l’application, disponible côté client. |
| `NEXT_PUBLIC_ENABLE_DEMO_ROUTES` | Met à `true` les pages de démonstration prévues à cet effet. Laisser `false` en production. |
| `PILOT_SEED_PASSWORD` | Mot de passe initial facultatif des comptes créés par le seed pilote. Valeur par défaut : `diveplan-pilot`. |
| `CRON_SECRET` | Secret Bearer exigé par la route de clôture automatique des séances. |

En développement seulement, une connexion de démonstration est disponible : `coach@diveplan.local` / `diveplan-demo`. Elle n’est pas disponible en production.

## Comptes et données du pilote

Le seed pilote est conçu pour être relancé sans vider les tables :

```bash
npm run db:seed:pilot
```

Comptes de démonstration du seed :

- Coach : `coach.pilote@diveplan.local`
- Athlètes : `emma.pilote@diveplan.local`, `leo.pilote@diveplan.local`, `mia.pilote@diveplan.local`
- Mot de passe initial par défaut : `diveplan-pilot` (modifiable avec `PILOT_SEED_PASSWORD`)

Le seed historique est également disponible :

```bash
npm run db:seed
```

**Attention :** ce seed historique vide les tables applicatives avant de recréer ses données. Ne pas l’exécuter sur une base contenant des données à conserver.

## Routes

### Entraîneur

| Route | Contenu |
| --- | --- |
| `/coach` | Tableau de bord |
| `/coach/planning` | Planning et événements |
| `/coach/sessions` | Liste des séances |
| `/coach/sessions/new` | Création d’une séance; accepte un `templateId` |
| `/coach/sessions/[id]` | Détail, duplication, impression et suivi de la séance |
| `/coach/sessions/[id]/edit` | Modification de la séance |
| `/coach/sessions/[id]/print` | Version imprimable |
| `/coach/athletes` et `/coach/athletes/[id]` | Athlètes, comptes et détail individuel |
| `/coach/groups` et `/coach/groups/[id]` | Groupes et détail d’un groupe |
| `/coach/groups/provincial` | Vue du groupe provincial |
| `/coach/library` | Bibliothèque dryland et accès aux templates |
| `/coach/templates` | Gestion des templates de séances |
| `/coach/monitoring` | Journal et indicateurs récents |
| `/coach/settings` | Identité du club et compte du coach connecté |

### Athlète

| Route | Contenu |
| --- | --- |
| `/athlete` | Accueil et séance du jour |
| `/athlete/calendar` | Calendrier |
| `/athlete/week` | Vue de la semaine |
| `/athlete/session/[id]` | Player d’une séance assignée |
| `/athlete/progress` | Progression |
| `/athlete/skills` | Compétences |
| `/athlete/profile` | Profil et plongeons de compétition |
| `/athlete/profile/golden-reps` | Historique des répétitions dorées |
| `/change-password` | Changement du mot de passe temporaire |

### API

- `POST /api/athlete/session-progress` : enregistre la progression de l’athlète connecté pour une séance qui lui est assignée.
- `GET /api/cron/complete-sessions` : clôture les séances échues; exige `Authorization: Bearer <CRON_SECRET>`.
- `/api/auth/[...nextauth]` : routes d’authentification Auth.js.

## Modèle des séances

Une séance contient des `SessionBlock`. Les athlètes sont rattachés à chaque bloc par `SessionBlockAssignment`. Cela permet de préparer des blocs communs ou des variantes, puis de suivre séparément l’exécution et le feedback de chaque athlète.

Les blocs piscine contiennent des sections par hauteur et des plongeons avec leur nombre de répétitions. Les blocs dryland référencent les exercices de la bibliothèque et peuvent remplacer leurs paramètres pour la séance.

## Commandes

| Commande | Action |
| --- | --- |
| `npm run dev` | Démarre le serveur de développement. |
| `npm run build` | Génère le build de production; `prebuild` génère Prisma Client et applique les migrations déployables. |
| `npm run start` | Démarre le serveur de production. |
| `npm run lint` | Lance ESLint. |
| `npm run test` | Lance les tests unitaires présents dans `src`. |
| `npm run prisma:generate` | Génère Prisma Client. |
| `npm run prisma:migrate` | Crée ou applique une migration en développement. |
| `npm run prisma:migrate:deploy` | Applique les migrations existantes en déploiement. |
| `npm run db:seed:pilot` | Ajoute ou met à jour les données du pilote sans vider les tables. |
| `npm run db:seed` | Réinitialise les données applicatives avec le seed de démonstration historique. |

## Déploiement Vercel

Configurer les variables d’environnement requises dans Vercel, en particulier `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` et `CRON_SECRET`. `NEXT_PUBLIC_APP_URL` doit correspondre à l’URL publique si elle est utilisée par l’environnement. Garder `NEXT_PUBLIC_ENABLE_DEMO_ROUTES=false` en production.

Le script `prebuild` applique `prisma migrate deploy` avant le build. Vérifier que la base configurée est celle du bon environnement avant tout déploiement.

`vercel.json` programme l’appel quotidien de `/api/cron/complete-sessions`. La route répond avec une erreur si `CRON_SECRET` est absent ou si l’en-tête Bearer ne correspond pas.

## Préparation commerciale

Pour l’état des pilotes, de l’exploitation SaaS et de la monétisation, consulter [SELLABLE_CHECKLIST.md](SELLABLE_CHECKLIST.md). Ce document est la référence pour les étapes encore à réaliser avant une commercialisation plus large.
