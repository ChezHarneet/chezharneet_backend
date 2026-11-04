# Speaking-content migration utility

The migration utility is deliberately limited to copying legacy `Essay.content`
into an explicitly unclassified draft version. It does not infer CLB labels,
split paragraphs, change existing Essay fields, assign Task 2 categories, or
modify Task/Theme/Topic records. Unclassified content remains marked for manual
review.

## Prerequisites

1. Review and apply the additive Prisma migration
   `prisma/migrations/20261104000000_speaking_essay_structure` through the
   normal deployment process. The script never runs schema migrations.
2. Ensure `backend/.env` has the already-approved `DATABASE_URL`. The script
   does not print the value.
3. Use a PostgreSQL environment with `pg_dump` available before using `--apply`.

## Dry run

From `backend/`, run:

```sh
npm run content:migrate:speaking
```

Dry-run is the default. It reads Essays and reports which rows could be copied;
it performs no database writes and does not create a database backup.

## Apply

Only run after explicit migration approval and after reviewing a dry-run:

```sh
npm run content:migrate:speaking -- --apply
```

Before the first write, the script creates a full custom-format database dump
under `backend/backups/speaking-content/`. If `pg_dump` fails, it stops without
writing migration data. Each Essay transformation and its
`ContentAuditLog` entry run in one transaction. Existing Essay values remain
unchanged. Re-running is idempotent: the migration label is unique per Essay,
and existing structured versions are left for manual reconciliation.

## Reports and rollback

Each run writes a JSONL record log, a reconciliation JSON report, and a
manual-review JSON report under `backend/audit/speaking-migration/`. Reports
contain source IDs, title, source-text length, and SHA-256 digest; they do not
copy essay text.

The backup is a recovery point, not an automatic rollback command. To recover,
restore it into an isolated PostgreSQL database and reconcile from that copy;
do not restore over production as part of this script. Task 2 category mapping
is intentionally not automated until a record-level, reviewed mapping is
available.
