# Pagination de la bibliothèque après actualisation

Base examinée : `master` / `5a7d771bd47c857ca4781d0410968270c7d17ad6`, Next.js installé et verrouillé 16.4.3. AGENTS.md et documentation locale des composants serveur/client et de `use client` lus avant modification.

## Défaut et comportement obtenu

`LibraryClient` conserve la page dans son état React. Après une Server Action, les nouvelles props peuvent réduire le nombre de pages sans réinitialiser cet état. Sept exercices, page 2, puis archivage du septième : la page conservait le numéro 2, affichait « Aucun exercice trouvé » et « 7 – 6 sur 6 » malgré six exercices disponibles. Retirer le dernier favori de cette page produit le même défaut en vue Favoris. Une édition qui retire une ligne des filtres actifs ou une actualisation provenant d'un autre onglet peut également réduire la liste.

Le composant ramène conditionnellement son propre état à la dernière page existante. React relance ce rendu avant de valider les enfants : pas d'effet, pas de temporisateur ni d'actualisation réseau supplémentaire. Le garde devient faux dès cette relance. Une page encore valide est conservée. Les résultats vides utilisent la page 1 et `0 – 0 sur 0`; une croissance ultérieure de la liste ne restaure pas l'ancienne page devenue invalide. Les erreurs de mutation gardent le dialogue et la page pour réessayer.

Aucune modification de SQL, d'autorisation, de cache, de sélection, de brouillon ou de règles métier. Aucune migration. La correction ne change pas le design.

## Preuve et tests synthétiques

`src/lib/library-pagination-sync.test.ts` charge et transpile le vrai composant. Un petit exécuteur de hooks conserve l'état entre les nouvelles props et reproduit les relances conditionnelles du rendu, avec limite de trois passages pour détecter une boucle. Les actions et le routeur sont simulés, sans données de production. Le mode avant enlève uniquement la nouvelle condition.

| Même scénario : 7 exercices, page 2, archivage, nouvelles props de 6 exercices | Avant | Après |
| --- | --- | --- |
| Lignes d'exercices visibles | 0 | 6 |
| Intervalle affiché | 7 – 6 sur 6 | 1 – 6 sur 6 |
| Message « Aucun exercice trouvé » | Oui | Non |
| Appels ajoutés par l'ajustement de page | 0 | 0 |

Six cas de régression plus le test parent : archivage, favoris, pages valides et réduction de plusieurs pages, liste vide puis croissance, erreur de suppression, recherche/matériel/catégorie. Les boutons de page et l'état du bouton suivant sont contrôlés. Les tests de mutation existants et ceux des PR #92/#93 complètent cette vérification après combinaison.

C'est une correction d'affichage et de synchronisation, pas une mesure de vitesse. Aucun gain de latence, de facture ou de transfert revendiqué. Les volumes SQL, HTML/RSC/JSON, fichiers JavaScript et transferts navigateur ne sont pas mesurés ici; Fast Origin Transfer désigne séparément le transfert entre compute et CDN et ne se déduit pas du nombre de lignes affichées.

## Diagnostic disponible le 3 novembre 2026

Projet `dive-plan`, ID `prj_P775WajMS3NIVzjDXawTdlRZ4CvT`, équipe `team_lAR7ON9BjPKPDVdpEaMPmDjz`, domaine et métadonnées GitHub `Felixmorin/DivePlan` revérifiés via les connecteurs. Production READY `dpl_Aczq2E5xy9n5kR2puQDKayGAYWcD`, commit identique à la base.

Fenêtre production 14:17:08–15:07:08 UTC (09:17–10:07 Toronto) : aucun log error/fatal retourné (limite 50), aucun groupe d'erreur sur 50 minutes. Cela ne prouve pas l'absence d'incident ni de trafic. Schéma de métriques découvert avant requête FOT sortant/somme : connecteur refusé HTTP 400, donc aucun total exploitable. Aucun accès connecté à l'application n'a été utilisé.

`/coach/observability` redirige vers `/coach`. L'instrumentation navigateur collecte LCP, INP, CLS, FCP et TTFB; les écrans administrateur présentent des moyennes/effectifs et ne fournissent pas des distributions utilisables pour des percentiles. Leurs données réelles n'ont pas été consultées. Les propositions antérieures d'instrumentation ne sont pas répétées : aucune nouvelle mesure n'est nécessaire pour établir ce défaut déterministe.

## Validation et déploiement

Les commandes et résultats finaux sont consignés dans la PR. Le build local n'est pas relancé : une exécution antérieure avait été refusée par le contrôle automatique d'approbation autour de Sentry; l'alternative est le build CI et la preview automatique habituelle. Ce document ne présente pas un build local comme réussi.

Pas de parcours connecté mobile/iPad exécuté; les tests portent sur le composant et ses handlers, pas sur une session navigateur réelle. Après déploiement approuvé, vérifier l'archivage du dernier exercice d'une page et le retrait du dernier favori sur mobile/iPad. Aucune promotion ni fusion automatique par cet agent.

PR #92 : supprime les rafraîchissements redondants des mutations. PR #93 : actualise l'aperçu mobile avec les props courantes. Cette correction concerne seulement la page devenue invalide; aucune dépendance de fusion. La compatibilité combinée est contrôlée avant publication prête à réviser.
