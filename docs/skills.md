# Skills du projet

Ce catalogue décrit les **54 skills locaux** installés dans `.agents/skills/`. Un skill fournit à l’agent une méthode ou une référence; ce n’est ni une fonction de l’application ni une dépendance exécutée par Next.js.

## Installation et mise à jour

Les fichiers sont dans `.agents/skills/<nom>/SKILL.md`. Certains skills incluent des guides complémentaires. Le dossier `.agents` est ignoré par Git : ses fichiers ne sont donc pas inclus dans les clones du dépôt. [`skills-lock.json`](../skills-lock.json) consigne les sources et empreintes des skills. Utiliser le gestionnaire de skills du poste pour les installer ou les mettre à jour, puis vérifier que le dossier local et le verrouillage correspondent.

Garder les consignes propres à DivePlan dans la documentation du projet plutôt que dans les fichiers de skills installés.

## Catalogue

### Interface, design et animation

Ces skills servent à concevoir, implémenter ou réviser l’interface, les interactions mobiles et le mouvement.

- `animate` — crée une animation web et choisit ses propriétés, sa durée et son comportement.
- `animate-expo` — animations et gestes pour React Native/Expo; non applicable à l’application web actuelle.
- `animation-performance` — diagnostique les animations web saccadées et leur coût de rendu.
- `animation-vocabulary` — identifie le nom d’un effet de mouvement décrit en langage courant.
- `apple-design` — interactions tactiles, gestes, transitions et principes de conception inspirés d’Apple.
- `ask-sonner` — guide d’utilisation de Sonner; utile si la bibliothèque est ajoutée ou utilisée.
- `break-ui` — éprouve une interface avec des données extrêmes ou incomplètes.
- `design-taste-frontend` — direction visuelle et finition des pages web et écrans d’application.
- `emil-design-eng` — finition UI, composants et détails d’interaction.
- `find-animation-opportunities` — audit en lecture seule des occasions d’ajouter du mouvement.
- `improve-animations` — audit et recommandations priorisées pour les animations existantes.
- `mobile-native` — améliore le comportement d’une application web sur téléphone et écran tactile.
- `pick-ui-library` — aide à choisir une bibliothèque pour un besoin d’interface donné.
- `prototype` — construit un prototype temporaire pour comparer une interaction ou une idée UI.
- `remove-animations` — retire les mouvements qui nuisent à la clarté, la vitesse ou l’accessibilité.
- `review-animations` — révise la qualité et la performance du code d’animation.

### Ingénierie et qualité du code

Ces skills soutiennent le diagnostic, la conception, l’implémentation et la revue technique.

- `code-review` — examine des changements par rapport aux standards du dépôt et à la demande initiale.
- `codebase-design` — aide à concevoir des modules aux interfaces simples et bien délimitées.
- `diagnosing-bugs` — démarche de diagnostic pour les bogues difficiles et les régressions de performance.
- `domain-modeling` — clarifie le modèle de domaine, la terminologie et les décisions d’architecture.
- `implement` — implémente un travail à partir de spécifications ou de tickets.
- `implement-spec` — met en œuvre une spécification et les tickets qui en découlent.
- `improve-codebase-architecture` — repère les possibilités d’améliorer l’architecture du code.
- `migrate-to-shoehorn` — migre les assertions de type des tests vers `@total-typescript/shoehorn`.
- `pr` — prépare le texte d’une demande de fusion (pull request).
- `research` — recherche des sources fiables et consigne les résultats dans un fichier Markdown.
- `security-audit` — examine les risques de sécurité de l’application, des API, des données et du déploiement.
- `tdd` — développe en suivant le cycle de tests d’abord (TDD).
- `to-spec` — transforme la discussion en spécification et la publie dans le système de tickets configuré.
- `to-tickets` — découpe un plan ou une spécification en tickets avec leurs dépendances.
- `triage` — qualifie et prépare des tickets ou demandes de fusion pour leur traitement.
- `wayfinder` — planifie un grand chantier sous forme de tickets de décision à résoudre progressivement.

### Planification, collaboration et rédaction

Ces skills aident à préciser une idée, organiser un travail long ou transmettre le contexte.

- `ask-matt` — oriente vers le skill ou le flux de travail adapté.
- `chief-of-staff` — coordonne un objectif de longue durée avec plusieurs agents.
- `claude-handoff` — transmet la tâche en cours à un nouvel agent en arrière-plan.
- `grill-me` — pose des questions approfondies pour tester un plan ou une décision.
- `grill-with-docs` — teste un plan tout en produisant les documents d’architecture associés.
- `grilling` — met à l’épreuve une idée ou une décision par des questions ciblées.
- `handoff` — résume le contexte dans un document de passation.
- `loop-me` — précise les besoins d’un flux de travail par une série de questions.
- `retro` — mène une rétrospective d’une session de développement.
- `teach` — explique une compétence ou un concept dans le contexte du projet.
- `to-questionnaire` — transforme une décision à clarifier en questionnaire.
- `wait-what` — demande de reformuler une explication qui n’a pas été comprise.
- `writing-beats` — organise des idées en étapes narratives avec les notions définies avant leur emploi.
- `writing-for-agents` — guide la rédaction de documents destinés aux agents, dont `AGENTS.md` et les skills.
- `writing-fragments` — rassemble des idées brutes sans leur imposer immédiatement une structure.
- `writing-shape` — organise des notes en article ou texte structuré.

### Configuration et opérations

Ces skills configurent des outils ou génèrent des structures de travail spécifiques.

- `git-guardrails-claude-code` — configure des protections Git pour Claude Code.
- `scaffold-exercises` — crée l’arborescence de sections et d’exercices d’un cours.
- `setup-matt-pocock-skills` — configure le dépôt pour les skills d’ingénierie de Matt Pocock.
- `setup-pre-commit` — configure Husky et des contrôles avant chaque commit.
- `setup-ts-deep-modules` — configure dependency-cruiser pour les modules TypeScript profonds.
- `wizard` — crée un assistant interactif pour les étapes qu’une personne doit effectuer elle-même.

## Utilisation

Décrire la tâche à l’agent; il choisira le skill adapté à partir de son nom et de sa description. Il est aussi possible de le nommer, par exemple : « Diagnostique ce bogue avec `diagnosing-bugs` » ou « Fais une revue de sécurité avec `security-audit` ».

Les skills ne remplacent pas les guides correspondant à la version de Next.js installée ni les décisions d’architecture du projet dans [`architecture/architecture.md`](architecture/architecture.md).
