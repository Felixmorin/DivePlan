# Polling de la simulation en direct

`CompetitionSimulationLive` interrogeait son API à intervalle fixe de 2,5 secondes, y compris quand l’onglet était en arrière-plan. Un intervalle fixe pouvait aussi lancer une deuxième requête avant que la précédente ne réponde.

La boucle démarre quand la page est visible, attend la fin de chaque lecture avant de planifier la suivante, suspend le prochain appel lorsque l’onglet est masqué, puis rafraîchit immédiatement au retour. Les mutations continuent à demander un rafraîchissement après leur succès.

## Comparaison synthétique

Pour une page ouverte et un intervalle de 2,5 secondes, le scénario d’un onglet masqué pendant une minute permettait jusqu’à 24 lectures API par onglet. La boucle testée en planifie 0 tant que l’onglet reste masqué. Le test utilise des promesses contrôlées et un planificateur simulé; le nombre maximal de lectures en vol est 1 et la reprise visible déclenche une lecture immédiate.

Ce calcul décrit le comportement du client, pas un échantillon de trafic de production. Il n’inclut pas les requêtes éventuellement déjà en vol au moment où l’onglet devient masqué. Il ne mesure ni les octets navigateur, ni le Fast Origin Transfer, ni le volume PostgreSQL, ni les temps de réponse.

## Validation

- Test ciblé de visibilité, de reprise et d’absence de chevauchement.
- Contrôle TypeScript et ESLint ciblé.
- Aucun changement de l’API, des autorisations ou des résultats de simulation.
