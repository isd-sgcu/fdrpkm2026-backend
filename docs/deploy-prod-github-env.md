# Production Deployment GitHub Environment Setup

The `Deploy Prod` workflow is manual-only, runs only from `main`, and reads its
configuration from the GitHub Environment named `prod`.

Create or open:

```txt
GitHub repository -> Settings -> Environments -> prod
```

Add required reviewers, prevent self-review when available, and restrict deployment
branches to `main`.

## Environment Variables

| Name                                | Required | Example / notes                                               |
| ----------------------------------- | -------- | ------------------------------------------------------------- |
| `GCP_PROJECT_ID`                    | Yes      | Production Google Cloud project ID.                           |
| `GCP_REGION`                        | Yes      | Example: `asia-southeast1`.                                   |
| `GAR_REPOSITORY`                    | Yes      | Production Artifact Registry repository.                      |
| `CLOUD_RUN_SERVICE_PROD`            | Yes      | Production Cloud Run service name.                            |
| `CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT` | Yes      | Runtime identity attached to Cloud Run.                       |
| `CLOUD_SQL_CONNECTION_NAME`         | Yes      | `project:region:instance`.                                    |
| `CLOUD_RUN_HEALTH_PATH`             | No       | Defaults to `/health/ready`, including a database check.      |
| `CLOUD_RUN_MIN_INSTANCES`           | No       | Defaults to `0`; use `1` to reduce cold starts at added cost. |
| `CLOUD_RUN_MAX_INSTANCES`           | No       | Defaults to `3`.                                              |
| `CLOUD_RUN_CONCURRENCY`             | No       | Defaults to `20`.                                             |
| `CLOUD_RUN_MEMORY`                  | No       | Defaults to `512Mi`.                                          |
| `CLOUD_RUN_CPU`                     | No       | Defaults to `1`; production requires an integer here.         |
| `CLOUD_RUN_VPC_CONNECTOR`           | No       | Serverless VPC Access connector name.                         |
| `CLOUD_RUN_VPC_EGRESS`              | No       | `private-ranges-only` (default) or `all-traffic`.             |
| `BETTER_AUTH_URL`                   | Yes      | Public HTTPS production API origin.                           |
| `GOOGLE_CLIENT_ID`                  | Yes      | Production Google OAuth client ID.                            |
| `S3_ENDPOINT`                       | No       | S3-compatible endpoint; empty is valid for AWS S3.            |
| `S3_REGION`                         | No       | Defaults to `auto`.                                           |
| `S3_BUCKET`                         | Yes      | Production upload bucket.                                     |
| `ASSET_BASE_URL`                    | No       | Public bucket or CDN base URL.                                |

## Environment Secrets

| Name                             | Purpose                                        |
| -------------------------------- | ---------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full Workload Identity provider resource name. |
| `GCP_SERVICE_ACCOUNT`            | GitHub deployment service account email.       |
| `DATABASE_URL`                   | Production PostgreSQL URL.                     |
| `BETTER_AUTH_SECRET`             | Unique production Better Auth secret.          |
| `GOOGLE_CLIENT_SECRET`           | Production Google OAuth client secret.         |
| `S3_ACCESS_KEY_ID`               | Production S3-compatible access key.           |
| `S3_SECRET_ACCESS_KEY`           | Production S3-compatible secret key.           |

When using the Cloud Run Cloud SQL mount, a PostgreSQL URL can use the Unix socket:

```txt
postgresql://USER:PASSWORD@/DATABASE?host=/cloudsql/PROJECT:REGION:INSTANCE
```

URL-encode special characters in the username or password.

## IAM Separation

Use separate service accounts:

- GitHub deployment service account: Artifact Registry Writer, Cloud Run Admin,
  and Service Account User on the runtime account.
- Cloud Run runtime service account: Cloud SQL Client and only the additional
  resource permissions the application needs.

The GitHub identity must have Workload Identity User on the deployment service
account. Do not create or upload a service-account JSON key.

## Scaling And Database Capacity

The application currently uses the `pg` default pool limit of `10` connections per
container. The default production maximum of `3` Cloud Run instances therefore has
a theoretical ceiling of approximately `30` application database connections.

Before increasing `CLOUD_RUN_MAX_INSTANCES`, verify:

```txt
max instances x pool size < available Cloud SQL connections
```

Reserve Cloud SQL connections for migrations, administration, monitoring, and
failover operations.

## Deployment And Rollback

Run from `Actions -> Deploy Prod -> Run workflow`, select `main`, and enter:

```txt
DEPLOY_PROD
```

The workflow pushes the immutable commit-SHA image, deploys it without traffic when
the service already exists, health-checks the candidate, promotes it, checks the live
service, and restores the previous traffic split if the live check fails. Only a
healthy image receives the `prod-latest` tag.

Cloud Run cannot create a brand-new service with zero traffic. The first production
deployment is therefore live immediately and has no revision available for rollback;
run it before opening the production endpoint to users. Later deployments use the
candidate and rollback flow.

The Artifact Registry repository must allow the `prod-latest` tag to move. If
immutable tags are enabled, remove the `prod-latest` tagging command and deploy or
roll back using commit-SHA tags only.

Manual rollback to an existing revision:

```bash
gcloud run services update-traffic CLOUD_RUN_SERVICE_PROD \
  --project GCP_PROJECT_ID \
  --region GCP_REGION \
  --to-revisions PREVIOUS_REVISION=100
```

Rollback by immutable image tag:

```bash
gcloud run deploy CLOUD_RUN_SERVICE_PROD \
  --project GCP_PROJECT_ID \
  --region GCP_REGION \
  --image GCP_REGION-docker.pkg.dev/GCP_PROJECT_ID/GAR_REPOSITORY/fdrpkm2026-backend:COMMIT_SHA
```
