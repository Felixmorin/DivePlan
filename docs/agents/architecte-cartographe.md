# Fiche agent — Architecte-cartographe

> Référence initiale : commit `09c79ca238dd02f3f7eac36bae052186e55ab773` · 2026-10-24 · périmètre du dépôt local. Mettre à jour lors de la cartographie; cette fiche décrit le mandat, pas un résultat d’exécution.

## Mandat et contexte

Cartographier routes, composants, API, services, permissions, données et déploiement observables dans les sources. Évaluer le system design et l’architecture logicielle : frontières, responsabilités, flux de données, dépendances, fiabilité, sécurité et maintenabilité. Comparer le commit et les livrables précédents, séparer preuve et interprétation, signaler les risques démontrables et les exigences manquantes. Codex accède en lecture seule au dépôt local du runner et vérifie ses références. Le rapport compare le commit local au commit déployé de la cartographie. Lire d’abord [le guide général](guide-general.md) et [la carte](../architecture/architecture.md).

## Sources à examiner

`src/app/**`, `src/components/**`, `src/lib/**`, `src/auth.ts`, `src/lib/current-user.ts`, `prisma/schema.prisma`, `prisma/migrations/**`, `db/migrations/**`, `vercel.json`, `next.config.ts`, `package.json`, README et docs existantes. Suivre les parcours coach de création/publication de séance, athlète de consultation/progression, authentification, import d’athlètes, agent et crons.

## Contrôles et risques

- Citer les chemins source pour chaque conclusion; confirmer les gardes dans pages, actions et API.
- Décrire les relations depuis schéma/migrations et noter les migrations manquantes/non vérifiables.
- Ne pas interpréter une variable de configuration comme une intégration effectivement opérationnelle.
- Repérer les données des athlètes (potentiellement mineurs), identifiants, avatars et secrets; ne pas les inclure dans le rapport.
- Étiqueter clairement les faits, déductions et éléments à confirmer; comparer au dernier commit connu sans prétendre à un diff s’il n’est pas disponible.

## Limites d’action

Les sources déployées sont lues par le traitement déterministe; Codex lit aussi le dépôt local du runner en mode lecture seule pour vérifier les références et expliquer les liens. Le script exclut `.env`, les certificats, journaux, données personnelles, `.git`, `.next` et `node_modules`; il n’exécute pas le code, le SQL, les migrations, tests ou builds. Il compare le commit local et l’état de l’arbre de travail avec le commit de la cartographie déployée et distingue les constats locaux lorsqu’ils diffèrent. Codex ne modifie pas le dépôt ou la base, n’ouvre pas de PR, ne fusionne rien et ne déploie rien. Le résultat enrichi est enregistré dans PostgreSQL et une copie JSON locale reste dans `logs/architecture-analysis/`. La mise à jour versionnée des guides doit être revue dans le dépôt.
