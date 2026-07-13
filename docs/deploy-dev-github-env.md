# Dev Deployment GitHub Environment Setup

The `Deploy Dev` workflow reads deployment config from the GitHub Environment named `dev`.

Create or open:

```txt
GitHub repository -> Settings -> Environments -> dev
```

## Environment Variables

Add these under `Environment variables`.

| Name                              | Example / notes                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`                  | Google Cloud project ID for dev.                                                                                                   |
| `GCP_REGION`                      | Example: `asia-southeast1`.                                                                                                        |
| `GAR_REPOSITORY`                  | Artifact Registry Docker repository name.                                                                                          |
| `CLOUD_RUN_SERVICE_DEV`           | Cloud Run service name for dev.                                                                                                    |
| `CLOUD_RUN_HEALTH_PATH`           | Use `/v1/health` for this repo.                                                                                                    |
| `ALLOW_DEV_DEPLOY_HEALTH_FAILURE` | Optional temporary bypass. Set to `true` only to stop promoted health-check failures from failing the dev workflow after rollback. |
| `BETTER_AUTH_URL`                 | Public dev API base URL, for example `https://dev-api.example.com`.                                                                |
| `GOOGLE_CLIENT_ID`                | Google OAuth client ID.                                                                                                            |
| `S3_ENDPOINT`                     | S3-compatible endpoint, for example Cloudflare R2.                                                                                 |
| `S3_REGION`                       | Use `auto` for Cloudflare R2 unless your provider needs another region.                                                            |
| `S3_BUCKET`                       | Upload bucket name.                                                                                                                |
| `ASSET_BASE_URL`                  | Public asset base URL. Leave empty only if presigned GET URLs are intended.                                                        |

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
- The dev Cloud Run service is deployed with `--allow-unauthenticated`, so it is publicly invokable for temporary smoke testing.
- On the first deploy, Cloud Run creates the service with live traffic because `--no-traffic` is not supported when creating a new service.
- On later deploys, the workflow deploys the candidate revision without traffic, health-checks it, then promotes it.
- Runtime app config is injected into Cloud Run with `gcloud run deploy --update-env-vars`.
- The deployed service is health-checked at `CLOUD_RUN_HEALTH_PATH` with plain `curl`.

## Required Health Path

This backend exposes health at:

```txt
/v1/health
```

Set:

```txt
CLOUD_RUN_HEALTH_PATH=/v1/health
```

The workflow defaults to `/v1/health` if `CLOUD_RUN_HEALTH_PATH` is not set.

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
- If any secret value contains a comma, switch the workflow from `--update-env-vars` flags to an env-vars file because `gcloud` treats commas as separators.
