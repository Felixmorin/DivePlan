# Rapports nocturnes d’hygiène du dépôt

Deux revues en lecture seule sont configurées :

- **Codex local** lance une revue quotidienne à 7 h, heure de Toronto. L’ordinateur doit être allumé et Codex ouvert pour qu’il puisse lire les fichiers locaux. Le rapport apparaît dans la tâche planifiée de Codex.
- **GitHub Actions** lance une revue quotidienne à 11 h UTC (6 h à Toronto en hiver, 7 h pendant l’heure avancée). Le rapport apparaît dans le résumé de l’exécution et comme artefact téléchargeable pendant 14 jours. Le workflow peut aussi être lancé à la demande depuis l’onglet Actions.

## Configuration GitHub requise

Dans le dépôt GitHub, ajouter un secret d’Actions nommé `OPENAI_API_KEY` avec une clé API OpenAI. Sans ce secret, le workflow échouera au lancement de Codex. La clé n’est pas stockée dans le dépôt.

Le workflow n’a que la permission `contents: read`. Codex utilise le profil `:read-only`; il ne peut donc pas modifier le checkout. Il ne crée ni commit, ni issue, ni pull request.

Le prompt partagé est dans `.github/prompts/repo-hygiene.md`. Il demande des constats brefs, étayés par des chemins et des preuves, et demande de signaler les hypothèses au lieu de conclure trop vite qu’un fichier est inutilisé. Toute suppression reste à valider par une personne.
