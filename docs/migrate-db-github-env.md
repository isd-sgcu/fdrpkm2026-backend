# Database Migration GitHub Environment Setup

The `Migrate Database` workflow uses one GitHub Environment for each target:

```txt
migration-dev
migration-prod
```

Create them under:

```txt
GitHub repository -> Settings -> Environments
```

Add required reviewers to `migration-prod` so a production migration cannot start
without approval.

## Environment Variables

| Name                              | Example / notes                                         |
| --------------------------------- | ------------------------------------------------------- |
| `GCP_PROJECT_ID`                  | Google Cloud project containing the Cloud SQL instance. |
| `CLOUD_SQL_INSTANCE_NAME`         | Cloud SQL instance ID, not the database name.           |
| `CLOUD_SQL_CONNECTION_NAME`       | Full value: `project:region:instance`.                  |
| `CLOUD_SQL_BACKUP_RETENTION_DAYS` | Optional positive integer. Defaults to `7`.             |

## Environment Secrets

| Name                             | Example / notes                                                            |
| -------------------------------- | -------------------------------------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full Workload Identity provider resource name.                             |
| `GCP_SERVICE_ACCOUNT`            | Migration service account email.                                           |
| `DATABASE_URL`                   | `postgres://USER:PASSWORD@127.0.0.1:5432/DATABASE` for the workflow proxy. |

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
