# Refuser les faux nombres dans la télémétrie

## Défaut et correction

Sur master `141a5000ed1de4b7de12c65cc0b02f859c65b0ca`, le POST
`/api/monitoring/transfer` applique `Number(...)` aux Web Vitals et aux trois
compteurs de transfert. `null`, `false`, `""`, `"0"` et `[]` deviennent ainsi
zéro. Un objet JSON `{ "valueOf": null, "toString": null }` provoque une
TypeError non interceptée pendant cette conversion.

Le collecteur navigateur envoie déjà des nombres JSON. Le serveur exige
désormais ce type, puis applique les mêmes bornes et contrôles de finitude et
d'intégralité. Les nombres zéro et les fractions autorisées restent acceptés.
Un lot mixte conserve ses entrées valides ; un lot entièrement invalide répond
400 sans requête SQL d'ingestion. L'identité et le club viennent toujours de la
session authentifiée. Aucun changement de schéma, cache ou dépendance.

## Reproduction synthétique

Le test exécute le véritable handler et ses requêtes SQL dans PGlite, avec les
migrations existantes et deux clubs fictifs. La variante avant rétablit seulement
les conversions `Number(...)` et retire les nouvelles gardes de type.

Même lot LCP : `[3000, null, false, "", "0", []]`.

| Agrégat | Avant | Après |
| --- | ---: | ---: |
| Mesures acceptées | 6 | 1 |
| Total des valeurs (ms) | 3000 | 3000 |
| Fausses mesures « bonnes » à zéro | 5 | 0 |
| Moyenne arithmétique (ms) | 500 | 3000 |

Cette hausse corrige un biais ; elle ne mesure aucune dégradation utilisateur.
Les effectifs sont des mesures, pas des visites, et la moyenne n'est pas un
percentile. Les cinq métriques LCP, INP, CLS, FCP et TTFB, leurs seuils inclusifs,
les compteurs de transfert, les lots mixtes, l'isolation par club, les origines
étrangères, les sessions expirées et la propagation des erreurs SQL sont testés.
L'objet malformé passe d'une exception à une réponse 400, sans ingestion SQL.

## État observé et limites

Inspection du 2 novembre 2026 : projet Vercel `dive-plan`, identifiants projet
et équipe fournis revérifiés avec le dépôt Felixmorin/DivePlan ; production
READY `dpl_5RBtzMvvQCqhJtETiJngK2Qou2kK`, commit `141a500`.
Aucun log error/fatal ni erreur runtime retourné pour les 50 minutes du
2026-11-02 20:08:43.973 au 20:58:43.973 UTC. Cela ne prouve pas l'absence
d'incident. Aucun incident de coercition effectivement observé en production.
Le schéma d'observabilité Vercel a été découvert avant la requête de métriques,
mais la requête Fast Origin Transfer a échoué HTTP 400.

`/coach/observability` redirige vers `/coach` dans le code actuel. Le collecteur,
le stockage et le tableau d'administration ont été examinés par le code ; aucune
donnée d'une page connectée n'a été consultée.

Les chiffres ci-dessus portent exclusivement sur des agrégats SQL synthétiques.
Ils ne représentent ni Fast Origin Transfer CDN/compute, ni octets réellement
transférés au navigateur, ni volume PostgreSQL mesuré, ni taille HTML/RSC/JSON,
ni taille des fichiers JavaScript. Aucun gain de facture ou de temps n'est
déduit. Les agrégats historiques potentiellement biaisés ne peuvent pas être
identifiés avec certitude et ne sont ni réécrits ni supprimés.

La PR #88 limite les octets du corps de ce même endpoint dans une autre zone ;
la présente correction traite exclusivement les types numériques. Une
combinaison locale doit être testée et son résultat consigné dans la PR.
Les PR #86 et #87 concernent d'autres parcours. Aucune dépendance de fusion.
Après déploiement approuvé séparément, vérifier que les émetteurs courants
continuent à ingérer de vraies mesures ; aucune collecte nouvelle n'est annoncée.

## Validation

Tests de régression et suite complète locale, génération des types Next.js
16.4.3, TypeScript, lint des deux fichiers TypeScript modifiés et vérification
du diff. Les résultats finaux de CI, du build et de preview sont consignés dans
la PR. Le build local n'est pas relancé après le refus automatique antérieur
lié à Sentry ; le build normal de CI sert de vérification distincte. Aucun test
connecté en production et aucune migration ne sont nécessaires à cette correction.
