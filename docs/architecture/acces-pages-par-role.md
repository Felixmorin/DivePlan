# Pages accessibles par rôle

> Inventaire des pages App Router relevées dans `src/app` le 2026-10-28. Les rôles correspondent à `User.role` (`ADMIN`, `COACH`, `ATHLETE`). Le tableau décrit les gardes visibles dans le code local; il ne garantit pas la configuration d’un déploiement. Les routes API (`src/app/api/**`) sont exclues.

## Règles générales

- Une page protégée redirige normalement les visiteurs non autorisés vers `/login` ou vers l’accueil de leur rôle. `requireCoach`, `requireAthlete` et `requireAdmin` sont définis dans `src/lib/current-user.ts`.
- L’accès coach exige aussi un profil coach et un club. `requireFullAccessCoach` restreint certaines fonctions au compte `felix@diveplan.com`.
- L’accès athlète exige un compte actif, un profil athlète, un club et un mot de passe configuré. Les pages athlète utilisent souvent `getCurrentAthlete()` et redirigent si aucun profil n’est disponible.
- Les layouts coach peuvent en plus masquer une fonctionnalité selon sa configuration (`FeatureAccessGate`).

## Tableau des pages

| Route | Page | ATHLETE | COACH | ADMIN | Garde / condition observée |
|---|---|:---:|:---:|:---:|---|
| `/` | Redirection vers l’espace du rôle | Oui | Oui | Oui | Session requise; redirige selon le rôle, sinon `/login`. |
| `/login` | Connexion | Oui* | Oui* | Oui* | Page publique; une session existante est redirigée vers son espace. |
| `/change-password` | Création du mot de passe | Oui* | Oui* | Non | Réservée aux comptes athlète ou coach sans mot de passe configuré; admin redirigé. |
| `/athlete` | Accueil athlète | Oui | Non | Non | Profil athlète requis. |
| `/athlete/calendar` | Calendrier | Oui | Non | Non | `requireAthlete()`. |
| `/athlete/week` | Historique des entraînements | Oui | Non | Non | Profil athlète requis. |
| `/athlete/session/[id]` | Séance assignée | Oui | Non | Non | Profil athlète requis; séance accessible selon l’affectation, sinon 404. |
| `/athlete/session/demo` | Séance de démonstration | Oui** | Non | Non | Dépend de la configuration de démo et d’un profil athlète; 404 si démo indisponible. |
| `/athlete/progress` | Progression | Oui | Non | Non | Profil athlète requis. |
| `/athlete/progress/details` | Détails de progression | Oui | Non | Non | Profil athlète requis. |
| `/athlete/skills` | Compétences | Oui | Non | Non | `requireAthlete()`. |
| `/athlete/preferences` | Préférences | Oui | Non | Non | Profil athlète requis. |
| `/athlete/profile` | Profil | Oui | Non | Non | Profil athlète requis. |
| `/athlete/profile/edit` | Modifier le profil | Oui | Non | Non | Profil athlète requis. |
| `/athlete/profile/badges` | Badges | Oui | Non | Non | Profil athlète requis. |
| `/athlete/profile/competition` | Compétitions du profil | Oui | Non | Non | Profil athlète requis. |
| `/athlete/profile/golden-reps` | Répétitions dorées | Oui | Non | Non | Profil athlète requis. |
| `/coach` | Tableau de bord coach | Non | Oui | Non | `requireCoach()`; redirection vers `/coach/access-denied` si fonctionnalité désactivée. |
| `/coach/access-denied` | Accès coach désactivé | Non | Oui | Non | `requireCoach()`. |
| `/coach/planning` | Calendrier de planification | Non | Oui | Non | `requireCoach()`; feature gate `calendar`. |
| `/coach/planification` | Planification avancée | Non | Oui*** | Non | `requireFullAccessCoach()`. |
| `/coach/sessions` | Séances | Non | Oui | Non | `requireCoach()` et feature gate `sessions`. |
| `/coach/sessions/new` | Créer une séance | Non | Oui | Non | `requireCoach()` et feature gate `sessions`. |
| `/coach/sessions/[id]` | Détail d’une séance | Non | Oui | Non | `requireCoach()` via le chargement de données; ressource vérifiée. |
| `/coach/sessions/[id]/edit` | Modifier une séance | Non | Oui | Non | `requireCoach()` et feature gate `sessions`. |
| `/coach/sessions/[id]/print` | Imprimer une séance | Non | Oui | Non | `requireCoach()` et feature gate `sessions`. |
| `/coach/sessions/demo` | Séance de démonstration | Non | Oui** | Non | Le layout `sessions` impose `requireCoach()` et le feature gate `sessions`; 404 si démo désactivée. |
| `/coach/sessions/demo/edit` | Modifier la démo | Non | Oui** | Non | Layout `sessions` et feature gate; 404 si démo désactivée. |
| `/coach/sessions/demo/print` | Imprimer la démo | Non | Oui** | Non | Layout `sessions` et feature gate; 404 si démo désactivée. |
| `/coach/athletes` | Répertoire d’athlètes | Non | Oui | Non | `requireCoach()` et feature gate `athletes`. |
| `/coach/athletes/[id]` | Dossier d’un athlète | Non | Oui | Non | `requireCoach()`; athlète limité au club du coach, sinon 404; feature gate `athletes`. |
| `/coach/groups` | Groupes | Non | Oui | Non | `requireCoach()`; feature gate de groupe selon layout. |
| `/coach/groups/[id]` | Détail d’un groupe | Non | Oui | Non | `requireCoach()`; groupe limité au club du coach, sinon 404. |
| `/coach/groups/provincial` | Groupes provinciaux | Non | Oui | Non | `requireCoach()`. |
| `/coach/library` | Bibliothèque | Non | Oui*** | Non | `requireFullAccessCoach()` et feature gate `library`. |
| `/coach/templates` | Modèles | Non | Oui*** | Non | `requireFullAccessCoach()` et feature gate `templates`. |
| `/coach/milestones` | Jalons | Non | Oui*** | Non | `requireFullAccessCoach()` et feature gate `milestones`. |
| `/coach/monitoring` | Suivi coach | Non | Oui*** | Non | `requireFullAccessCoach()` et feature gate `monitoring`. |
| `/coach/observability` | Observabilité coach | Non | Oui*** | Non | `requireFullAccessCoach()` et feature gate `observability`. |
| `/coach/settings` | Réglages coach | Non | Oui*** | Non | `requireFullAccessCoach()`. |
| `/admin` | Tableau de bord admin | Non | Non | Oui | `requireAdmin()`. |
| `/admin/users` | Utilisateurs | Non | Non | Oui | `requireAdmin()`. |
| `/admin/coaches` | Entraîneurs | Non | Non | Oui | `requireAdmin()`. |
| `/admin/agents` | Console des agents | Non | Non | Oui | `requireAdmin()`. |
| `/admin/agents/context` | Contexte des agents | Non | Non | Oui | `requireAdmin()`. |
| `/admin/agents/consolidation` | Consolidation des agents | Non | Non | Oui | `requireAdmin()`. |
| `/admin/activite-parcours` | Activité et parcours | Non | Non | Oui | `requireAdmin()`. |
| `/admin/base-de-donnees` | Base de données | Non | Non | Oui | `requireAdmin()`. |
| `/admin/couts-quotas` | Coûts et quotas | Non | Non | Oui | `requireAdmin()`. |
| `/admin/erreurs-stabilite` | Erreurs et stabilité | Non | Non | Oui | `requireAdmin()`. |
| `/admin/monitoring` | Monitoring | Non | Non | Oui | `requireAdmin()`. |
| `/admin/observability` | Observabilité | Non | Non | Oui | `requireAdmin()`. |
| `/admin/observability/requests` | Requêtes observées | Non | Non | Oui | `requireAdmin()`. |
| `/admin/optimisation` | Optimisation | Non | Non | Oui | `requireAdmin()`. |
| `/admin/performance` | Performance | Non | Non | Oui | `requireAdmin()`. |
| `/admin/sante-app` | Santé de l’application | Non | Non | Oui | `requireAdmin()`. |
| `/admin/sante-generale` | Santé générale | Non | Non | Oui | `requireAdmin()`. |

`Oui*` indique une page accessible en cours de création de compte ou aux visiteurs non connectés, avec redirection pour un utilisateur déjà connecté. `Oui**` dépend de l’activation des données de démonstration. `Oui***` signifie que le garde `requireFullAccessCoach()` limite actuellement la page au compte dont l’adresse normalisée est `felix@diveplan.com`.

## Références et limites

- Rôles et redirections : `src/lib/current-user.ts`, `src/app/page.tsx`, `src/app/login/page.tsx`, `src/app/change-password/page.tsx`.
- Pages athlète : `src/app/athlete/**`; données et vérification du profil via `src/lib/athlete-session.ts`.
- Pages coach et limites fonctionnelles : `src/app/coach/**`, layouts de segment et `src/components/coach/feature-access-gate.tsx`.
- Pages admin : `src/app/admin/**`.
- Cet inventaire porte sur les pages trouvées dans le dépôt local. Il faudra le réviser lors de l’ajout, du retrait ou du changement de garde d’une page; les droits sur les actions serveur et API demandent leur propre vérification.
