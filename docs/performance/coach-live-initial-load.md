# Charger les résultats une seule fois sur la vue coach en cours

## Défaut et correction

Base : master `b9148d1620a41ec810d57ad1683d873d9a83300b`. La page `/coach/sessions/:id` chargeait d’abord les résultats complets via `getCoachSession`, puis `getLiveSessionProgress` pour la vue IN_PROGRESS. Les tableaux complets (complétions, absences, exercices et plongeons réalisés avec profils/notes) étaient abandonnés : le composant utilise le plan réduit et la progression séparée. La requête des notes coach était également inutilisée sur cette branche.

La page demande désormais `includeResults: "unlessLive"`. Le chargeur décide depuis le statut du snapshot autorisé : IN_PROGRESS retourne le plan sans lancer les quatre lectures de résultats; tous les autres statuts conservent le résultat complet. Le mode par défaut et le mode impression `false` ne changent pas. Un type discriminé par statut rend les tableaux absents sur la branche en cours; ils ne sont pas présentés comme des résultats vides.

Le sérialiseur live accepte explicitement un plan. Sa sortie et le contrat du composant client restent identiques. Le chargement de progression, les règles d’accès au club, les identités affichées, les présences et le polling sont conservés. La lecture des notes coach est évitée uniquement pour IN_PROGRESS.

## Preuves synthétiques

`node --import tsx --test src/lib/coach-session-hydration.test.ts src/lib/coach-live-overview.test.ts src/lib/live-plan.test.ts`

Même séance PGlite avec 12 blocs, 1 201 résultats de plongeons, 301 résultats d’exercices, une complétion et une absence. SQL réel de getCoachSession; authentification et snapshot contrôlés aux frontières. Horodatages des résultats fixés pour rendre la comparaison reproductible. Une comparaison locale par mode :

| Hydratation après snapshot seulement | Chargement complet | Mode live |
|---|---:|---:|
| Lectures SQL | 7 | 3 |
| Octets des lignes SQL représentées en JSON | 641 085 | 12 743 |

Soit **−98,0 %** des octets JSON de cette seule phase. Authentification, snapshot, progression live et notes coach sont exclus du tableau. La page évite en plus sa lecture de notes coach, sans changement de ce qui est affiché. Nombre et volume réels des résultats détermineront le gain réel; aucun temps, CPU ou gain de facture n’est mesuré.

Le test de page exécute la vraie fonction serveur extraite par AST avec un plan dépourvu de résultats. Il vérifie les props du composant live (plan, noms, clé de version et progression séparée), l’absence de lecture des notes coach et le refus d’un snapshot de progression manquant. Il vérifie aussi les résultats, notes et présences transmis au résumé terminé. Les chargeurs sont simulés dans ce test; les vrais SQL et l’isolation des clubs sont vérifiés par le test PGlite séparé. Les tests existants de rendu du composant live (totaux, détails et contrôles de présence) restent inchangés.

Le test SQL compare les modes pour DRAFT, READY, COMPLETED, CANCELLED et NOT_DONE, et vérifie les refus sans autorisation ou hors club. Aucun cache partagé ni migration. Aucune mutation de répétitions, golden reps, évaluations, présences ou planification.

Ce gain PostgreSQL estimé n’est ni le Fast Origin Transfer CDN/compute, ni le transfert navigateur, ni la taille HTTP HTML/RSC/JSON ou des fichiers JavaScript. Les props clientes restent identiques : aucune réduction de réponse navigateur revendiquée.

## Observabilité disponible

Le 30 octobre 2026, projet dive-plan, équipe, domaine dive-plan.vercel.app et lien Git Felixmorin/DivePlan reconfirmés via connecteurs. Production examinée : READY `dpl_12kfmkgRAjL3MHPrws6aDNoToF2X`, commit de base.

Aucun log error/fatal production sur **21:17:18–22:07:18 UTC (17:17:18–18:07:18 Montréal)** et aucun cluster d’erreur sur 50 minutes. Cela ne prouve pas l’absence d’incident ni l’utilisation du parcours. Catalogue de métriques Vercel découvert; requête FOT sortant refusée HTTP 400. CLI Vercel absente, aucun relevé plateforme exploitable.

`/coach/observability` redirige vers `/coach`. Instrumentation existante SQL (`ServerRequestMetric` : queryCount/resultBytes/sqlDurationMs) et navigateur/Web Vitals LCP, INP, CLS, FCP, TTFB inspectées dans le code; pas de session connectée disponible ni de données privées consultées. Aucun percentile déduit de moyennes ou mesure assimilée à une visite. Pas de nouvelle mesure nécessaire pour démontrer ces lectures abandonnées; pas de nouvelle collecte.

Après déploiement habituel, comparer des ouvertures de séances en cours de même taille via les compteurs SQL existants, puis vérifier progression/présences et transition vers COMPLETED sur mobile/iPad. Aucune garantie d’économie de facture.
