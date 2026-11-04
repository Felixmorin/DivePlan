# Produit DivePlan

## Résumé

DivePlan est une application web destinée aux clubs de plongeon. Elle relie la préparation des entraînements par le coach au programme consulté et exécuté par l’athlète, puis au suivi de la progression et des résultats. Le produit est présenté comme étant en phase de pilotes accompagnés avec des clubs.

## Utilisateurs et besoins

- **Coach / entraîneur** : planifier entraînements, camps et compétitions; construire et réutiliser des séances; affecter des blocs à tout ou partie d’un groupe; préparer les plongeons et exercices; partager le programme; suivre l’exécution, les absences et les retours; observer la progression individuelle et collective.
- **Athlète** : consulter le calendrier et la séance assignée; suivre les consignes bloc par bloc; consigner exercices, plongeons, répétitions, notes et ressenti; revoir ses compétences et sa progression.
- **Administrateur** : gérer les accès des coachs et leur association à un club; surveiller l’état de l’application, certains indicateurs techniques et les outils d’analyse internes. C’est un rôle d’exploitation, distinct du parcours sportif.
- **Club** : contexte organisationnel auquel sont rattachés coachs, athlètes et réglages d’identité. L’application ne documente pas encore d’inscription autonome du club.

Ces besoins sont déduits des routes, permissions et fonctions présentes; la validation par recherche utilisateur n’est pas documentée.

## Rôles et parcours

### Coach

Le coach dispose d’un tableau de bord, d’un calendrier et d’une planification, de listes de séances et d’un éditeur de séance, d’une bibliothèque d’exercices dryland et de modèles de séance. Il gère les athlètes, les groupes et leurs listes de plongeons de compétition. Il peut publier, suivre, modifier, dupliquer et imprimer des séances, examiner leur état d’exécution et consulter le monitoring. Certaines fonctions dépendent des droits activés pour le compte ou le club; certaines pages sont réservées à un accès coach complet.

### Athlète

L’athlète accède à son accueil, calendrier, semaine, séance assignée, progression, compétences et profil. Le player permet d’enregistrer l’avancement bloc par bloc, les exercices et répétitions réalisés, les répétitions « dorées », des notes sur les plongeons, du feedback par bloc et un commentaire de fin de séance. L’athlète peut déclarer une absence. Des notifications Web Push sont facultatives.

### Administration

Le rôle `ADMIN` dispose de routes dédiées à la gestion des utilisateurs, coachs, santé, performances et agents internes. Il n’est pas présenté comme un rôle sportif.

## Fonctions principales

1. **Planification** — calendrier d’entraînements, camps et compétitions; planning hebdomadaire et vue de planification annuelle.
2. **Construction d’une séance** — séance composée de blocs ordonnés, avec durée, volume estimé, description et affectations par athlète. Des variantes individuelles sont possibles.
3. **Contenu piscine et dryland** — un bloc piscine comprend des sections par hauteur et des plongeons avec code, nom, position, répétitions et notes. Un bloc dryland référence les exercices de la bibliothèque; les paramètres peuvent être adaptés dans la séance.
4. **Réutilisation et diffusion** — modèles de séance, duplication, publication aux athlètes affectés et version imprimable.
5. **Exécution et suivi** — les athlètes consignent le travail; le coach consulte l’état de la séance, les complétions, absences et retours.
6. **Progression sportive** — historique, compétences, listes de compétition, évaluations et jalons (« milestones »).
7. **Gestion et exploitation** — gestion des comptes, groupes, réglages, notifications et outils administratifs de supervision.

## Vocabulaire DivePlan

| Terme | Sens dans le produit |
|---|---|
| **Séance** | Entraînement planifié, constitué d’un ou plusieurs blocs. |
| **Bloc** | Partie d’une séance affectable à un ou plusieurs athlètes; types observés : échauffement (`warmup`), dryland, piscine (`pool`), retour au calme (`cooldown`) et personnalisé (`custom`). |
| **Dryland** | Travail physique hors de l’eau, construit à partir d’exercices de la bibliothèque. |
| **Section piscine** | Regroupement de plongeons par hauteur dans un bloc piscine. |
| **Plongeon** | Mouvement identifié notamment par un code, un nom, une position et un nombre de répétitions. |
| **Répétition dorée / golden rep** | Répétition mise en évidence et conservée dans l’historique de l’athlète. Le critère sportif exact qui la mérite est **à confirmer**. |
| **Modèle / template** | Structure de séance enregistrée afin de la charger dans une nouvelle séance. Le code et l’interface emploient les deux formes. |
| **Liste de compétition** | Ensemble des plongeons associés à l’athlète pour la compétition. |
| **Milestone** | Jalons de progression gérés dans l’espace coach; leur définition métier et leurs critères sont **à confirmer**. |
| **Séance publiée / brouillon / en cours / terminée / annulée** | États visibles dans l’interface et le code; les règles de transition sont portées par l’application. |

## Limites et décisions à confirmer

- Le produit est en pilotes accompagnés; l’inscription autonome des clubs, la facturation et la gestion d’abonnements ne sont pas intégrées.
- Les comptes sont préparés ou accompagnés par l’équipe. Les identifiants temporaires d’athlète sont transmis par le coach; les invitations et réinitialisations de mot de passe par courriel ne sont pas configurées. L’authentification SSO n’est pas intégrée.
- L’import CSV existe dans la documentation et le code, mais l’audit du parcours coach relève que son composant n’est pas relié à la page des athlètes : disponibilité effective à confirmer.
- Les définitions officielles de « répétition dorée », « milestone », les publics prioritaires au-delà des rôles implémentés, et les résultats sportifs attendus sont **à confirmer** avec les responsables produit et les clubs.
- Les processus commerciaux, soutien, sauvegarde et confidentialité pour une exploitation plus large, notamment avec des mineurs, restent à définir selon la checklist commerciale.

## Sources du dépôt

README.md; SELLABLE_CHECKLIST.md; COACH_WORKFLOW_AUDIT.md; docs/architecture/acces-pages-par-role.md; docs/architecture/architecture.md; docs/web-push.md; `src/components/coach/coach-shell.tsx`; `src/components/athlete/athlete-shell.tsx`; `src/components/athlete/session-player.tsx`; `src/lib/session-structure.ts`; `src/lib/session-status.ts`; schéma Prisma.
