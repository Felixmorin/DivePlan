# Appliquer la limite de télémétrie aux octets réellement lus

Base : master `141a5000ed1de4b7de12c65cc0b02f859c65b0ca`, branche par défaut et commits/PR récents revérifiés. PR ouvertes #68, #86 et #87 : aucun fichier commun ni dépendance de fusion. AGENTS.md et documentation Route Handlers du Next installé/verrouillé 16.4.3 lus.

## Défaut et correction

L'endpoint `/api/monitoring/transfer` annonçait maxRequestBytes = 20 000, mais utilisait raw.length après request.text(). Ce nombre mesure des unités UTF-16, pas les octets UTF-8. Si Content-Length est absent ou sous-estimé, un lot Unicode pouvait dépasser le budget. Le corps entier était aussi consommé avant le contrôle, y compris pour les lots ASCII largement au-dessus de la limite.

La lecture compte maintenant les octets de chaque bloc avant décodage. Au premier dépassement, elle retourne 413 et demande l'annulation du reste du flux, sans attendre une annulation potentiellement bloquée/rejetée. Le verrou du reader est libéré dans finally. Le TextDecoder incrémental conserve les caractères UTF-8 répartis entre plusieurs blocs.

Le contrôle rapide Content-Length est conservé; le flux reste l'autorité sur la taille lue. Origine et session sont vérifiées au même endroit qu'avant : origine étrangère 403, session expirée 204 sans consommation du corps. Les corps absents, JSON invalides et erreurs de lecture gardent leur chemin 400. Aucun SQL d'ingestion, calcul de Web Vitals, clé de club, rétention, donnée personnelle ou parcours sportif ne change.

## Preuve synthétique

Commande : `node --import tsx --test src/lib/telemetry-body-limit.test.ts`.

Le vrai handler est transpilé dans une VM. Les Request/Response/ReadableStream et TextDecoder sont réels; l'identité est adaptée et les vrais SQL de télémétrie s'exécutent dans PGlite avec les migrations locales existantes. Aucune connexion externe. La référence remplace uniquement la lecture bornée par les deux anciennes lignes request.text()/raw.length.

| Même entrée synthétique | Avant | Après |
| --- | ---: | ---: |
| Lot Unicode : 11 069 unités UTF-16 / 22 069 octets UTF-8, sans Content-Length | 200 | 413 |
| Écritures de télémétrie de ce lot | 1 | 0 |
| Corps ASCII de 200 069 octets, blocs contrôlés de 4 096 octets : octets consommés par le handler | 200 069 | 20 480 |
| Statut du corps ASCII surdimensionné | 413 | 413 |

La lecture s'arrête au premier bloc qui franchit la limite, avant son décodage. **20 480 n'est pas un plafond universel de lecture** : un gros bloc fourni par le transport peut être plus volumineux. Le texte assemblé/décodé reste borné au budget; la taille du bloc entrant et les tampons de la plateforme ne sont pas contrôlés par ce helper. L'annulation du reste est best effort et ne prouve pas une réduction des octets déjà reçus par Vercel.

Les tests vérifient aussi un corps valide de exactement 20 000 octets, découpé octet par octet avec caractères multioctets; les cinq Web Vitals sont conservés avec leurs valeurs/effectifs et les agrégats de transfert avec leurs requêtes/octets/cacheHits. Les clubs sont isolés. Autres cas : Content-Length sous-estimé, garde déclarative sans lecture, origine/session, JSON absent/invalide, erreur de flux, annulation rejetée ou non résolue, absence de verrou et d'écriture d'ingestion pour les refus. La lecture d'authentification existante n'est pas supprimée.

Les adaptateurs VM de deux suites existantes exposent désormais TextDecoder, comme les autres API Web du runtime. Les tests de requêtes détaillées, normalisation, idempotence et Web Vitals existants restent exécutés. Les clients habituels normalisent les chemins en ASCII et fractionnent les observations par vingt; ils n'ont pas besoin de changement de protocole pour respecter cette limite. Un lot réellement supérieur au budget est désormais refusé même si son nombre de caractères est inférieur.

## Observations et limites

Le 2 novembre 2026, projet `dive-plan`, projectId `prj_P775WajMS3NIVzjDXawTdlRZ4CvT`, teamId `team_lAR7ON9BjPKPDVdpEaMPmDjz`, domaine et lien Git Felixmorin/DivePlan reconfirmés via connecteurs. Production READY `dpl_5RBtzMvvQCqhJtETiJngK2Qou2kK`, commit 141a500.

Aucun log error/fatal production sur **19:15:44–20:05:44 UTC (14:15:44–15:05:44 Montréal)**, ni cluster d'erreur sur 50 minutes; l'absence de logs ne prouve pas l'absence d'incident. Catalogue métrique découvert avant interrogation; requête FOT échouée HTTP 400. Aucun abus réel, fréquence de lots trop grands ou gain financier observé.

`/coach/observability` redirige toujours vers `/coach`; instrumentation SQL/transferts/Web Vitals examinée par le code sans accès connecté, aucune connexion contournée. Les valeurs des cinq Vitals dans le test sont des échantillons synthétiques, pas des visites ou percentiles de production.

Fast Origin Transfer CDN/compute, transferts navigateur, volume PostgreSQL estimé, HTML/RSC/JSON HTTP et fichiers JavaScript sont distincts. Cette preuve mesure des octets d'entrée consommés sur un flux local contrôlé et des écritures refusées, pas les transferts réseau de la plateforme, les réponses HTTP ou le trafic PostgreSQL. Aucun gain de latence, CPU, FOT ou facture revendiqué. La correction ne fixe pas une durée maximale de lecture et ne mesure pas les tampons du transport.

Aucune migration, nouvelle dépendance, nouvelle collecte ou modification de rétention. Après déploiement habituel : vérifier la réception des lots valides dans l'observabilité connectée, puis regarder les statuts 413 de cet endpoint via les outils existants si disponibles. Pas de parcours connecté mobile/iPad testé et aucune collecte corrigée présentée comme observée en production.
