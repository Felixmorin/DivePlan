# Pipeline de sécurité et d’observabilité

Le workflow **CI / Sécurité** s’exécute sur les pull requests vers `master` et sur chaque push à `master`. Il vérifie les dépendances npm, ESLint, les tests et le build, puis lance CodeQL et Gitleaks.

## Bloquer les déploiements non vérifiés

Les contrôles sur un push à `master` donnent un résultat après le push. Pour qu’ils protègent la production, configurer dans GitHub **Settings → Rules → Rulesets** (ou **Branches**) :

- Exiger une pull request avant toute fusion vers `master`.
- Exiger les contrôles **CI / Sécurité / Qualité et dépendances**, **CI / Sécurité / Analyse CodeQL** et **CI / Sécurité / Détection de secrets**.
- Empêcher les contournements de la règle, sauf pour les administrateurs qui doivent intervenir en urgence.

Vérifier aussi dans les paramètres Vercel que `master` est bien la branche de production et que les déploiements partent après la fusion.

## Protection des secrets

Le workflow Gitleaks vérifie les commits et l’historique Git des pull requests. Activer également **Secret scanning** et **Push protection** dans **GitHub → Settings → Code security and analysis** pour bloquer la fuite dès le push. Si un secret est détecté, le révoquer et le remplacer; supprimer sa valeur du dernier commit ne suffit pas.

## Signaux après déploiement

Sentry est déjà configuré dans le projet pour ne transmettre les erreurs et traces qu’en production lorsque `SENTRY_DSN` et `NEXT_PUBLIC_SENTRY_DSN` sont définis. L’échantillonnage des traces est de 10 % et les événements passent par le filtre de confidentialité du projet. Garder ces variables dans Vercel et vérifier qu’une erreur de test apparaît dans le bon projet Sentry après un déploiement.

Les indicateurs opérationnels existants restent dans les pages de monitoring de DivePlan. Les contrôles ci-dessus ajoutent les résultats du pipeline comme signaux de chaque commit et arrêtent une fusion lorsque les vérifications échouent.
