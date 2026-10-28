# Canonical SQL migration history

`db/migrations` is the sole canonical history for schema changes created after
the repository's migration handoff. Prisma Migrate is retired: existing files
under `prisma/migrations` are immutable historical migrations and must not be
extended or replayed as a second stream. The handoff does not change the
application's Prisma schema client; update `prisma/schema.prisma` when a schema
change requires it.

The database already has a restored schema and data; `0000_restored_schema_baseline.sql` is
an inert marker and must never be used to recreate those tables. The repository
does not establish which migrations have been applied in any deployed database.
Before deployment, the operator must compare the target database's migration
ledger and schema with the historical Prisma migrations and this SQL history.
Do not replay either history blindly. Apply only unapplied changes in order,
using the established ledger/operational procedure for that environment.

Add one ordered SQL file per future change. Review it against the checked-in
historical schema reference before deployment. Do not execute migrations from
application build or install scripts. Apply reviewed migrations explicitly in
the intended environment, outside Vercel builds, and never use destructive DDL
to reset restored data.

For a feature whose original schema change exists only in `prisma/migrations`,
that Prisma file remains the historical source of the change. Its deployment
status must be confirmed per environment. Any follow-up or repair after the
handoff belongs in a new, later `db/migrations` file; record the corresponding
Prisma model update where applicable. Never copy the historical SQL into a new
migration merely to make the histories appear aligned.
Migration `0014_architecture_cartographer.sql` ajoute Architecte-cartographe au
registre des agents avec le déclenchement manuel activé uniquement.


Migration `0026_request_observations.sql` ajoute le détail des ressources navigateur
pour l’explorateur admin. Appliquez-la avant le nouveau collecteur; les agrégats
existants sont conservés. Le cron authentifié `request-observations` purge le détail
ancien séparément. Voir `docs/transfer-monitoring.md` pour le déploiement et les limites.
