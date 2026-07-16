# Database Migration GitHub Environment Setup

The `Migrate Database` workflow uses one GitHub Environment:

```txt
migration-dev
```

Create or open it under:

```txt
GitHub repository -> Settings -> Environments
```

Because both database targets use this environment, its protection rules apply to
both dev and prod migrations. Keep the manual `MIGRATE_DEV` / `MIGRATE_PROD`
confirmation enabled. Production migrations may only be dispatched from the
`main` branch. If production later requires separate reviewers, restore separate
`migration-dev` and `migration-prod` environments.

## Environment Variables

| Name                              | Example / notes                                                |
| --------------------------------- | -------------------------------------------------------------- |
| `GCP_PROJECT_ID`                  | Google Cloud project containing the shared Cloud SQL instance. |
| `CLOUD_SQL_INSTANCE_NAME`         | Shared Cloud SQL instance ID, not either database name.        |
| `CLOUD_SQL_CONNECTION_NAME`       | Shared value: `project:region:instance`.                       |
| `CLOUD_SQL_BACKUP_RETENTION_DAYS` | Optional positive integer. Defaults to `7`.                    |

## Environment Secrets

| Name                             | Example / notes                                          |
| -------------------------------- | -------------------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full Workload Identity provider resource name.           |
| `GCP_SERVICE_ACCOUNT`            | Migration service account email.                         |
| `DATABASE_URL_DEV`               | `postgres://USER:PASSWORD@127.0.0.1:5432/DEV_DATABASE`.  |
| `DATABASE_URL_PROD`              | `postgres://USER:PASSWORD@127.0.0.1:5432/PROD_DATABASE`. |

The workflow selects exactly one database URL from the dispatch `target`. Both URLs
use `127.0.0.1:5432` because the workflow connects through Cloud SQL Auth Proxy.

## Migration execution

The workflow runs `bun run db:migrate`, not the SQL files directly. Drizzle records
applied migrations in `drizzle.__drizzle_migrations` and applies all pending journal
migrations in one PostgreSQL transaction. Re-running the workflow therefore skips
already applied migrations and a failure rolls back the whole pending batch.

## Backup Retention

Before applying SQL, the workflow creates an on-demand Cloud SQL backup. Cloud SQL
does not support setting an expiration on an individual on-demand backup, so the
workflow deletes expired backups after a successful migration.

Cleanup is restricted to backup descriptions beginning with:

```txt
github-actions-<target>-migration-
```

The current run's backup is always preserved. Cleanup is not executed when the
migration fails, preserving the backup needed for manual recovery.

The migration service account needs these capabilities:

- Connect to Cloud SQL, normally with `roles/cloudsql.client`.
- Create, list, get, and delete Cloud SQL backups. `roles/cloudsql.editor` includes
  these permissions; a custom least-privilege role is preferred for production.

## Running A Migration

Open `Actions -> Migrate Database -> Run workflow`, select `dev` or `prod`, and
enter the matching confirmation value:

```txt
MIGRATE_DEV
MIGRATE_PROD
```
