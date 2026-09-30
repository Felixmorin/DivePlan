# Local SQL migration history

This directory replaces Prisma Migrate for future schema changes. The database
already has a restored schema and data; `0000_restored_schema_baseline.sql` is
an inert marker and must never be used to recreate those tables.

Add one ordered SQL file per future change. Review it against the checked-in
historical schema reference before deployment. Do not execute migrations from
application build or install scripts. Apply reviewed migrations explicitly in
the intended environment, outside Vercel builds, and never use destructive DDL
to reset restored data.
