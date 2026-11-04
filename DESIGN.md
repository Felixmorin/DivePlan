# Design de DivePlan

Ce document décrit les conventions visuelles relevées dans le code au 29 octobre 2026. L’interface n’est pas entièrement unifiée : les espaces coach, athlète et administration ont des thèmes et des composants propres. Les valeurs listées comme « proposées » sont des pistes de cohérence, pas des changements réalisés.

## Identité visuelle en place

### Couleurs

Les principaux tokens de `src/app/globals.css` définissent une interface coach claire, avec contraste marine/cyan :

| Rôle | Valeur actuelle |
|---|---|
| Encre / marine | `#071423` |
| Texte secondaire | `#526173` |
| Fond coach | `#eef7fb` |
| Surface | `#ffffff`; surface élevée `#f8fbff` |
| Bordure | `#d7e4ec`; bordure forte `#b9cbd8` |
| Marque cyan | `#19bfd3`; variante forte `#0797b1` |
| Action corail | `#ff6b57`; variante forte `#e64f3d` |
| Succès | `#16a66a`; fond doux `#dff8ec` |
| Avertissement / danger | `#f59e0b` / `#dc2626` |

Les couleurs de blocs aident à distinguer leur fonction : échauffement bleu pâle, dryland ambre, piscine cyan, retour au calme vert, bloc personnalisé gris. Le rouge de club (`#ed163d`) est aussi défini, sans être la couleur générale de marque.

L’espace athlète utilise par défaut un fond presque noir (`#050505`), des panneaux `#111111` et `#1b1b1b`, du texte clair et un accent d’action corail. Le player possède aussi un thème clair explicite, avec accent bleu (`#0878ff`). L’espace administration utilise notamment un fond gris clair et une navigation marine; un contrôle de thème est présent.

Les pages ne consomment pas toutes exclusivement ces tokens : plusieurs écrans, notamment les vues de séance terminée, planification annuelle et administration, définissent des couleurs locales. Ne pas supposer qu’un unique thème couvre chaque écran.

### Typographie

Aucune police de marque ni police web externe n’est chargée dans le layout racine. Les composants reposent majoritairement sur la police sans empattement par défaut de Tailwind / du navigateur, avec des graisses souvent fortes pour les titres, labels et statuts. La planification annuelle fixe explicitement `Arial, Helvetica, sans-serif`. **À confirmer** : famille typographique officielle et échelle typographique de référence.

### Formes, espacements et composants

- Les tokens communs posent des rayons de `1rem` pour les éléments UI et `1.5rem` pour les grands panneaux, ombres légères et une durée rapide de `180ms`.
- Le rythme courant utilise des pas utilitaires Tailwind (`gap-1` à `gap-4`, marges/paddings `p-3` à `p-6`); il n’existe pas d’échelle d’espacement unique appliquée à toutes les pages.
- Les composants partagés comprennent boutons avec variantes (principal cyan, action corail, secondaire, contour, discret, sombre, succès), cartes, badges, alertes, champs, onglets, dialogues, avatars, skeletons, barres de progression, états vides et notifications toast.
- Les cartes sont généralement blanches, bordées, arrondies et légèrement ombrées. Les statuts et types de blocs sont montrés sous forme de pastilles colorées et souvent accompagnées d’une icône.
- Les icônes sont principalement Lucide. Les avatars d’athlètes utilisent des initiales; le README indique que les photos de profil ont été retirées.
- Le player athlète privilégie de grandes cibles tactiles et des panneaux sombres; le coach utilise aussi des listes, tableaux, formulaires et vues de planification denses.

### Navigation

- **Coach** : barre latérale fixe à partir du breakpoint `lg`; sous `lg`, en-tête collant avec marque, navigation horizontale défilante et rangée distincte pour monitoring, réglages et déconnexion. La navigation principale a neuf destinations configurées, plus deux outils.
- **Athlète** : contenu centré sur une largeur maximale de 430 px; navigation fixe en bas sur quatre destinations (Accueil, Calendrier, Progression, Profil), avec marge pour les zones sûres iOS.
- **Administration** : navigation latérale à partir de `md`; en-tête mobile fixe avec contrôle de thème.
- L’élément actif est indiqué par fond/couleur et, selon la navigation, `aria-current="page"`. Certains libellés visibles demeurent en anglais (« Milestones », « Monitoring », « Template ») au sein d’une interface principalement française.

### Responsive

Les layouts utilisent des breakpoints Tailwind (`sm`, `md`, `lg`, `xl`) et des media queries propres aux pages, parfois à 1000, 760, 640 ou 480 px. Les colonnes de tableaux de bord se replient; les tableaux et planifications larges peuvent défiler horizontalement. L’espace athlète reste étroit et centré et adapte le padding aux zones sûres. Une règle globale porte à 16 px le texte des contrôles éditables sur petits écrans pour éviter le zoom automatique d’iOS Safari. Les seuils ne sont pas harmonisés dans tout le produit.

## États et retours

- **Séances** : brouillon, publiée/planifiée, en cours, terminée, non faite, annulée et repos sont représentés par des badges/pastilles, parfois avec icône.
- **Opérations** : boutons désactivés et textes d’attente sont présents dans plusieurs formulaires; des skeletons existent pour les chargements de pages; erreurs, alertes, confirmations et empty states ont des composants dédiés.
- **Notifications** : toast de succès, erreur ou information avec icône, annonce live, fermeture manuelle et disparition après environ 4,5 secondes.
- **Player** : exercices et répétitions différencient non commencé, complété et « doré »; confirmation avant de quitter avec changements non enregistrés; feedback de progression et dialogues.
- Ces états ne sont pas rendus partout de manière identique; les libellés et couleurs peuvent varier selon l’écran.

## Animations

Le mouvement est principalement micro-interactif : transitions de couleur, bordure ou ombre autour de 150–200 ms, légère élévation des cartes au survol, apparition des toasts et effets de célébration de milestone. Les préférences de mouvement réduit sont respectées dans les règles globales et la page de connexion; le player utilise `motion-safe` pour certains effets. Toutes les animations locales n’ont pas nécessairement une règle spécifique équivalente : à vérifier lors de tout ajout.

## Accessibilité observée

- Le layout racine déclare le document en français (`lang="fr"`). Des liens et boutons ont des noms accessibles, les navigations portent des libellés ARIA, et des sections/dialogues utilisent des rôles et associations de titre/description.
- Des indicateurs de focus visibles sont présents sur les composants partagés et plusieurs écrans. Les changements asynchrones utilisent `aria-live`, `role="status"` ou `role="alert"` dans divers parcours.
- Les composants de player nomment des commandes icône seule et des répétitions par leur contexte. Certaines couleurs de statut sont doublées par du texte ou une icône.
- **À confirmer / contrôler** : couverture complète des labels de formulaire, ordre/focalisation des dialogues, contrastes calculés de chaque paire texte/fond, comportement clavier des interactions personnalisées et alternatives non colorées dans chaque écran. Le code seul ne prouve pas la conformité WCAG.

## Proposition de cohérence UI/UX Pro Max — à confirmer

Le skill UI/UX Pro Max a été exécuté pour un tableau de bord sportif de club. Sa suggestion générique de style énergique en blocs et une palette rouge/or ne correspondent pas assez aux choix cyan/marine déjà centralisés dans l’application; son modèle de page d’inscription à webinaire est hors contexte. La proposition ci-dessous conserve donc les tokens et motifs qui sont déjà attestés, et vise à réduire les écarts sans redessiner l’application :

1. Prendre le duo marine `#071423` + cyan `#19bfd3` comme base commune coach/produit, réserver le corail `#ff6b57` à l’action principale et garder les couleurs actuelles de type/statut avec une icône et un libellé.
2. Conserver le thème sombre athlète comme choix d’expérience spécifique au player, avec son thème clair existant si sélectionné; clarifier la relation entre préférence et valeur par défaut **à confirmer**.
3. Centraliser dans les tokens les couleurs, rayons, ombres, focus et espacements actuellement redéfinis localement; documenter les exceptions avant de les harmoniser.
4. Garder les trois modèles de navigation adaptés aux rôles, mais normaliser libellés, états actifs et tailles tactiles; confirmer la nomenclature française avant toute modification.
5. Maintenir une famille sans empattement système tant qu’aucune police de marque n’est décidée; établir ensuite une échelle de titres, texte, métadonnées et densité des tableaux.
6. Pour les futurs ajouts, préférer feedback bref (150–200 ms), focus clavier visible, motion réduit, contrastes vérifiés, contrôles tactiles d’au moins 44 px lorsque le layout le permet, et adaptation des tables larges par défilement explicite ou cartes.

Ces points sont des recommandations de design, pas des exigences produit adoptées. Les seuils de contraste, la famille de police, la palette de marque officielle et la convergence souhaitée entre les rôles sont **à confirmer**.

## Sources du dépôt

`src/app/globals.css`; `src/app/layout.tsx`; `src/app/login/login.module.css`; `src/components/ui/button.tsx`; `src/components/ui/card.tsx`; `src/components/ui/badge.tsx`; `src/components/ui/empty-state.tsx`; `src/components/ui/toast-provider.tsx`; `src/components/training/status-pill.tsx`; `src/components/training/session-card.tsx`; `src/components/coach/coach-shell.tsx`; `src/components/athlete/athlete-shell.tsx`; `src/components/athlete/mobile-bottom-nav.tsx`; `src/components/athlete/session-player.tsx`; `src/components/admin/admin-shell.tsx`; `src/components/admin/admin-navigation.tsx`; skill local `.codex/skills/ui-ux-pro-max/SKILL.md` et sa recherche de système de design / UX.
