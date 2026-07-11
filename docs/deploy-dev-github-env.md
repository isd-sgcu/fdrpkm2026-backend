# Dev Deployment GitHub Environment Setup

The `Deploy Dev` workflow reads deployment config from the GitHub Environment named `dev`.

Create or open:

```txt
GitHub repository -> Settings -> Environments -> dev
```

## Environment Variables

Add these under `Environment variables`.

| Name                    | Example / notes                                                             |
| ----------------------- | --------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`        | Google Cloud project ID for dev.                                            |
| `GCP_REGION`            | Example: `asia-southeast1`.                                                 |
| `GAR_REPOSITORY`        | Artifact Registry Docker repository name.                                   |
| `CLOUD_RUN_SERVICE_DEV` | Cloud Run service name for dev.                                             |
| `CLOUD_RUN_HEALTH_PATH` | Use `/v1/health` for this repo.                                             |
| `BETTER_AUTH_URL`       | Public dev API base URL, for example `https://dev-api.example.com`.         |
| `GOOGLE_CLIENT_ID`      | Google OAuth client ID.                                                     |
| `S3_ENDPOINT`           | S3-compatible endpoint, for example Cloudflare R2.                          |
| `S3_REGION`             | Use `auto` for Cloudflare R2 unless your provider needs another region.     |
| `S3_BUCKET`             | Upload bucket name.                                                         |
| `ASSET_BASE_URL`        | Public asset base URL. Leave empty only if presigned GET URLs are intended. |

## Environment Secrets

Add these under `Environment secrets`.

| Name                             | Example / notes                                |
| -------------------------------- | ---------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full Workload Identity provider resource name. |
| `GCP_SERVICE_ACCOUNT`            | Deploy service account email.                  |
| `DATABASE_URL`                   | Dev Postgres connection string.                |
| `BETTER_AUTH_SECRET`             | Strong random Better Auth secret.              |
| `GOOGLE_CLIENT_SECRET`           | Google OAuth client secret.                    |
| `S3_ACCESS_KEY_ID`               | S3-compatible access key ID.                   |
| `S3_SECRET_ACCESS_KEY`           | S3-compatible secret access key.               |

## How The Workflow Uses These Values

- GitHub Actions uses `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT` to authenticate to Google Cloud without a service account JSON key.
- The workflow builds and pushes images to:

```txt
GCP_REGION-docker.pkg.dev/GCP_PROJECT_ID/GAR_REPOSITORY/fdrpkm2026-backend:<tag>
```

- The workflow deploys the commit-SHA image to `CLOUD_RUN_SERVICE_DEV`.
- Runtime app config is injected into Cloud Run with `gcloud run deploy --update-env-vars`.
- The deployed service is health-checked at `CLOUD_RUN_HEALTH_PATH`.

## Required Health Path

This backend exposes health at:

```txt
/v1/health
```

Set:

```txt
CLOUD_RUN_HEALTH_PATH=/v1/health
```

Using `/health` will fail the deployment health check for this repo.

## Notes

- Do not commit `.env` files.
- Do not add Google service account JSON keys to GitHub.
- If any secret value contains a comma, switch the workflow from `--update-env-vars` flags to an env-vars file because `gcloud` treats commas as separators.
