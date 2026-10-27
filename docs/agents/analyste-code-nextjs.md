# Fiche agent — Analyste du code Next.js

## Dernier rapport

**26 octobre 2026** — [Rapport complet](../../logs/nextjs-code-analysis/analysis-20261026-154033-9d135542.md) (analyse statique sur Next.js 16.3.3).

- Le chemin des Web Vitals est capturé au chargement du module; après navigation côté client, les mesures peuvent rester associées à la première page.
- La mécanique d’envoi de télémétrie `sendBeacon` puis `fetch` est dupliquée dans deux modules; le rapport propose de partager uniquement le transport.
- Aucun fichier ou package inutilisé n’a été confirmé. Trois grands fichiers sont des candidats à un découpage ciblé, après analyse de leurs responsabilités.
- Aucun coût de production n’a été mesuré. L’analyse exclut `src/lib/athlete-session.ts`, qui était modifié localement au moment de l’audit.

## Rôle

Utiliser Codex local, connecté au compte ChatGPT de l’utilisateur, pour analyser le code Next.js et TypeScript de DivePlan. L’agent cherche des pistes de coûts d’exécution, des fichiers et dépendances potentiellement inutilisés, du code dupliqué et des améliorations de lisibilité. Il rédige un rapport en français sans modifier le dépôt.

## Lancement

Le bouton « Démarrer l’analyse Codex » se trouve dans la page Admin → Agents. Il ajoute une demande à la file DivePlan; un runner actif sur l’ordinateur qui contient le dépôt la prend ensuite en charge.

Installer le runner une fois depuis la racine du dépôt, avec Codex CLI installé et connecté :

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-nextjs-analysis-runner.ps1
```

Le runner interroge la file toutes les 15 secondes et démarre avec la session Windows. Le rapport complet est enregistré sous `logs/nextjs-code-analysis/analysis-<date>.md`; seul l’état et le chemin local sont envoyés à DivePlan pour l’historique de la page Agents. Le dossier `logs/` est ignoré par Git. Pour une analyse directe sans bouton, le script `analyze-nextjs-code.ps1` peut aussi être lancé manuellement et reçoit `-Model <nom>` pour choisir un modèle disponible dans Codex.

Le runner utilise le secret serveur `CORRECTION_RUNNER_TOKEN` déjà prévu pour le runner local DivePlan. Il le mémorise chiffré par Windows DPAPI pour le compte courant.

## Périmètre

L’agent examine les sources Next.js et TypeScript de `src/app`, `src/components`, `src/lib`, les fichiers d’instrumentation, `next.config.ts`, `package.json` et `vercel.json` selon le besoin. Il peut consulter la documentation Next.js locale installée pour confirmer les conventions App Router, Server Components, Client Components, Server Actions, Route Handlers et cache.

Il n’analyse pas SQL, les fichiers `.sql`, les migrations, le schéma Prisma, les statistiques de base de données, RLS ou les plans d’exécution. Il n’inspecte pas les variables d’environnement, les secrets, les certificats, les données personnelles, les journaux, `.git`, `.next` ou `node_modules`.

## Sécurité et limites

- L’analyse Codex est exécutée avec `--sandbox read-only` et `--ephemeral`.
- L’agent ne modifie ni ne supprime de fichiers, ne lance pas de tests/build/migrations, ne crée ni branche ni PR et ne déploie rien.
- Les coûts ne sont pas mesurés directement et aucune facture Vercel ou autre fournisseur n’est consultée. Le rapport formule des hypothèses de charge et indique comment les mesurer; il ne promet pas d’économies en dollars.
- Les fichiers apparemment inutilisés sont vérifiés contre les imports, références, conventions de routes Next.js et usages dynamiques. Les cas ambigus restent « à confirmer ».
- Le rapport est local et n’est pas envoyé à DivePlan. Une correction ultérieure doit être demandée séparément et révisée humainement.
