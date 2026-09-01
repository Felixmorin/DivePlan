# DivePlan - Checklist vendable

## Statut produit

DivePlan est maintenant oriente vers un MVP pilote: les coachs peuvent se connecter, creer une seance en base de donnees, assigner des blocs aux athletes, ouvrir une seance reelle, imprimer une feuille de bassin, inviter des utilisateurs, importer un CSV et suivre les evenements applicatifs.

Ce n'est pas encore un SaaS self-serve complet. Le bon positionnement commercial court terme est: pilote accompagne pour clubs de plongeon.

## 1. Produit reel

- [x] Login coach/athlete par mot de passe, avec code pilote temporaire.
- [x] Contexte utilisateur courant avec role et club.
- [x] Creation de seance persistante en base de donnees.
- [x] Liste, detail et impression de seances depuis Prisma.
- [x] Flux athlete de completion rattache a l'athlete connecte.
- [x] Edition d'une seance existante: details, statut, blocs, assignations, exercices et plongeons existants.
- [ ] Duplication de seance/template.
- [x] Import CSV d'athletes et groupes.

## 2. Multi-utilisateur et securite

- [x] Verification serveur dans les actions critiques.
- [x] Acces coach limite au club connecte.
- [x] Suppression du fallback athlete code en dur.
- [x] Invitations par lien d'activation.
- [x] Mots de passe haches avec PBKDF2 natif Node.
- [x] Journal d'audit minimal pour auth, invitation, import, creation, modification et completion.
- [ ] Envoi email transactionnel.
- [ ] SSO via fournisseur d'auth production.

## 3. Pilote commercial

- [ ] Choisir 1 a 2 clubs pilotes.
- [ ] Importer leurs vrais athletes, groupes et coachs.
- [ ] Faire tester 3 workflows: planifier, imprimer/executer, suivre la progression.
- [ ] Mesurer temps gagne par seance et frequence d'utilisation hebdomadaire.
- [ ] Convertir en offre pilote payante mensuelle.

## 4. Operations SaaS

- [ ] Base PostgreSQL managable avec sauvegardes automatiques.
- [ ] Environnements `preview` et `production`.
- [x] Monitoring applicatif minimal dans `/coach/monitoring`.
- [ ] Monitoring externe erreurs et performance.
- [ ] Procedure de support: contact, temps de reponse, export donnees.
- [ ] Politique de confidentialite adaptee aux athletes mineurs.

## 5. Monetisation

- [ ] Prix pilote manuel par club.
- [ ] Contrat simple: club, nombre de coachs, nombre approximatif d'athletes, duree pilote.
- [ ] Paiement manuel au depart.
- [ ] Stripe seulement apres validation du prix et du cycle de vente.
