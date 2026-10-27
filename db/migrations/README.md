# Local SQL migration history

This directory replaces Prisma Migrate for future schema changes. The database
already has a restored schema and data; `0000_restored_schema_baseline.sql` is
an inert marker and must never be used to recreate those tables.

Add one ordered SQL file per future change. Review it against the checked-in
historical schema reference before deployment. Do not execute migrations from
application build or install scripts. Apply reviewed migrations explicitly in
the intended environment, outside Vercel builds, and never use destructive DDL
to reset restored data.
Migration `0014_architecture_cartographer.sql` ajoute Architecte-cartographe au
registre des agents avec le déclenchement manuel activé uniquement.


Migration `0026_request_observations.sql` ajoute le détail des ressources navigateur
pour l’explorateur admin. Appliquez-la avant le nouveau collecteur; les agrégats
existants sont conservés. Le cron authentifié `request-observations` purge le détail
ancien séparément. Voir `docs/transfer-monitoring.md` pour le déploiement et les limites.
