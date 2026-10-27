# Vérifications de santé de l’administration

Les tests se lancent depuis **Administration → Santé générale → Lancer des vérifications réelles**. Ils ne tournent pas à chaque affichage. Les résultats sont conservés 90 jours dans `AdminHealthCheckRun`.

## Mise à niveau SQL

Appliquer `db/migrations/0025_admin_health_check_runs.sql` explicitement dans l’environnement concerné avant d’attendre les historiques cron ou les résultats persistants. Comme pour les autres migrations, ne pas l’exécuter pendant un build Vercel.

Après application, les prochaines exécutions de `/api/cron/complete-sessions` et `/api/cron/agent-runs` inscrivent succès, échec et heure d’exécution. L’état devient vérifiable après leur première exécution. `CRON_SECRET` doit être configuré sur l’hébergement.

## Connexion et parcours HTTP

Configurer côté serveur :

- `HEALTH_CHECK_BASE_URL` : origine HTTPS de l’application (sans chemin), joignable depuis le serveur;
- `HEALTH_CHECK_EMAIL` et `HEALTH_CHECK_PASSWORD` : identifiants d’un compte de test DivePlan activé.

Le bouton **Tester la connexion** suit le flux CSRF, callback credentials, cookie de session et `/api/auth/session`. **Tester le parcours connecté** poursuit jusqu’au rendu d’une page protégée en lecture seule (`/coach/athletes`, `/athlete/calendar` ou `/admin` selon le rôle). C’est un test HTTP de fumée, pas un parcours utilisateur complet. Les parcours complets ne sont pas encore automatisés; les tester en sécurité demande une base et des comptes de test isolés pour ne pas publier de vraies séances ni altérer une progression. Le callback produit toutefois l’événement normal `auth.login` pour le compte de test; utiliser un compte dédié, sans données personnelles.

## Confirmation Sentry

Configurer `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` et `SENTRY_PROJECT`. Le jeton doit avoir le scope `project:read`. `SENTRY_API_URL` est facultatif (par défaut `https://sentry.io`; utiliser le domaine régional ou Sentry auto-hébergé le cas échéant).

Le bouton crée un événement informatif explicitement tagué `diveplan.health_check`, attend le flush du SDK, puis recherche son ID avec l’API Sentry. Cela crée réellement un événement dans le projet Sentry.

## Accusé Web Push

Configurer `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `NEXT_PUBLIC_VAPID_PUBLIC_KEY` avec la même paire. Dans Santé générale, lancer le test sur un navigateur HTTPS, accepter sa permission et garder DivePlan connecté. Le navigateur transmet son abonnement directement au contrôle administrateur, qui envoie une notification ponctuelle et attend que le service worker l’affiche et accuse réception; l’abonnement de test n’est pas ajouté à la table des abonnements. Le service confirme l’affichage demandé au navigateur, pas que l’utilisateur a vu la notification.

