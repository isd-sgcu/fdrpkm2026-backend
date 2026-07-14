# Dev Deployment GitHub Environment Setup

The `Deploy Dev` workflow reads deployment config from the GitHub Environment named `dev`.

Create or open:

```txt
GitHub repository -> Settings -> Environments -> dev
```

## Environment Variables

Add these under `Environment variables`.

| Name                                | Example / notes                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`                    | Google Cloud project ID for dev.                                                                                                   |
| `GCP_REGION`                        | Example: `asia-southeast1`.                                                                                                        |
| `GAR_REPOSITORY`                    | Artifact Registry Docker repository name.                                                                                          |
| `CLOUD_RUN_SERVICE_DEV`             | Cloud Run service name for dev.                                                                                                    |
| `CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT` | Runtime service account attached to Cloud Run.                                                                                     |
| `CLOUD_SQL_CONNECTION_NAME`         | Cloud SQL connection name in `PROJECT:REGION:INSTANCE` format.                                                                     |
| `CLOUD_RUN_HEALTH_PATH`             | Use `/v1/health/ready`; this gates promotion on database connectivity.                                                             |
| `ALLOW_DEV_DEPLOY_HEALTH_FAILURE`   | Optional temporary bypass. Set to `true` only to stop promoted health-check failures from failing the dev workflow after rollback. |
| `BETTER_AUTH_URL`                   | Canonical dev API fallback URL: `https://api-staging.rpkm2026.com`.                                                                |
| `GOOGLE_CLIENT_ID`                  | Google OAuth client ID.                                                                                                            |
| `S3_ENDPOINT`                       | S3-compatible endpoint, for example Cloudflare R2.                                                                                 |
| `S3_REGION`                         | Use `auto` for Cloudflare R2 unless your provider needs another region.                                                            |
| `S3_BUCKET`                         | Upload bucket name.                                                                                                                |
| `ASSET_BASE_URL`                    | Public asset base URL. Leave empty only if presigned GET URLs are intended.                                                        |

## Environment Secrets

Add these under `Environment secrets`.

| Name                             | Example / notes                                |
| -------------------------------- | ---------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full Workload Identity provider resource name. |
| `GCP_SERVICE_ACCOUNT`            | Deploy service account email.                  |
| `DATABASE_URL`                   | Dev PostgreSQL Cloud SQL Unix-socket URL.      |
| `BETTER_AUTH_SECRET`             | Strong random Better Auth secret.              |
| `GOOGLE_CLIENT_SECRET`           | Google OAuth client secret.                    |
| `S3_ACCESS_KEY_ID`               | S3-compatible access key ID.                   |
| `S3_SECRET_ACCESS_KEY`           | S3-compatible secret access key.               |

## How The Workflow Uses These Values

- GitHub Actions uses `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT` to authenticate to Google Cloud without a service account JSON key.
- Cloud Run uses `CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT`, which must have Cloud SQL Client.
- The workflow mounts `CLOUD_SQL_CONNECTION_NAME` into the container at `/cloudsql/PROJECT:REGION:INSTANCE`.
- The workflow builds and pushes images to:

```txt
GCP_REGION-docker.pkg.dev/GCP_PROJECT_ID/GAR_REPOSITORY/fdrpkm2026-backend:<tag>
```

- The workflow deploys the commit-SHA image to `CLOUD_RUN_SERVICE_DEV`.
- The dev Cloud Run service is deployed with `--allow-unauthenticated`, so it is publicly invokable for temporary smoke testing.
- Dev scaling/resources are fixed at min instances `0`, max instances `1`, memory `256Mi`, CPU `1`, and the Gen1 execution environment.
- On the first deploy, Cloud Run creates the service with live traffic because `--no-traffic` is not supported when creating a new service.
- On later deploys, the workflow deploys the candidate revision without traffic, health-checks it, then promotes it.
- Runtime app config is injected using a protected temporary env file that is deleted immediately after deployment.
- The deployed service is health-checked at `CLOUD_RUN_HEALTH_PATH` with plain `curl`.

## Database Connection

The deployment secret and migration secret use different connection endpoints.
Cloud Run uses its mounted Unix socket:

```txt
DATABASE_URL=postgresql://fdrpkm_app_runtime:URL_ENCODED_PASSWORD@/DATABASE_NAME?host=/cloudsql/PROJECT:REGION:INSTANCE
```

The migration workflow starts Cloud SQL Auth Proxy and therefore uses localhost:

```txt
DATABASE_URL_DEV=postgresql://fdrpkm_migrator_dev:URL_ENCODED_PASSWORD@127.0.0.1:5432/DATABASE_NAME?sslmode=disable
```

Both URLs must name the same dev database. URL-encode reserved characters in passwords.

## Required Health Paths

The deployment promotion gate checks database readiness:

```txt
/v1/health/ready
```

Set:

```txt
CLOUD_RUN_HEALTH_PATH=/v1/health/ready
```

The workflow defaults to `/v1/health/ready`. The container/Docker liveness check remains
`/v1/health`, so a temporary database outage does not restart otherwise healthy containers.

## Required IAM

- Runtime service account: `roles/cloudsql.client` on the project.
- GitHub deployment service account: `roles/iam.serviceAccountUser` on the runtime service account.
- Keep the deployment and runtime service accounts separate; do not attach the GitHub deployer to Cloud Run.

## Temporary Failure Email Bypass

GitHub sends Actions failure emails when the workflow ends in failure. This repo does not send those emails itself.

If the workflow must still show as failed, do not use `continue-on-error`. Temporarily stop the email at the GitHub notification/watch level instead:

- Repository page -> Watch button -> Custom -> uncheck Actions, or choose Ignore for the incident window.
- GitHub profile -> Settings -> Notifications -> Actions -> disable or reduce email notifications.

For only promoted health-check failures after rollback, this GitHub Environment variable can stop that specific final failure path:

```txt
ALLOW_DEV_DEPLOY_HEALTH_FAILURE=true
```

That variable does not suppress emails for earlier failures such as build, Docker push, authentication, or `gcloud run deploy`. Remove the variable or set it to `false` after the incident is fixed.

## Notes

- Do not commit `.env` files.
- Do not add Google service account JSON keys to GitHub.
- Runtime secrets are written only to a permission-restricted temporary runner file and are not printed.
