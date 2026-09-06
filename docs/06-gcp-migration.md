# GCP infrastructure migration

## Goal

Move compute and CI/CD off Vercel to fix latency and reduce cost. Keep Neon (Postgres) and Resend (email): neither is tied to Vercel, and both are cheaper and simpler to keep than to replace.

## Decision

- **Keep Neon.** Usage-based, autosuspend-to-zero billing beats an always-on Cloud SQL instance at this traffic level. No code change: it's already reached over the public internet, same from Cloud Run as from Vercel.
- **Keep Resend.** Not tied to any host; it's an SMTP/API call from application code. Free tier (3,000 emails/month) covers current volume.
- **Move compute and CI to GCP.** Cloud Run (Docker) replaces Vercel's hosting and auto-deploy.

## Target architecture

| Concern | Current (Vercel) | Target (GCP) |
| --- | --- | --- |
| App hosting | Vercel serverless functions | Cloud Run (Docker container running the custom `server.ts`, not `next start` — see below) |
| Cold starts | Vercel default | `--min-instances=1` keeps one warm instance |
| Cron (`due-notifications`) | Vercel Cron (`vercel.json`) | Cloud Scheduler, HTTP job with `CRON_SECRET` bearer header |
| Docker image storage | n/a | Artifact Registry |
| CI/CD | GitHub Actions + `vercel deploy` | GitHub Actions + `gcloud run deploy` (same trigger shape) |
| Attachments | Vercel Blob (`@vercel/blob`) | Cloud Storage (`@google-cloud/storage`), code change required |
| Custom domains | Vercel domain aliasing | Cloud Run domain mapping |
| Database | Neon | Neon (unchanged) |
| Email | Resend SMTP | Resend SMTP (unchanged) |
| Source control | GitHub | GitHub (unchanged, Cloud Source Repositories is discontinued for new users) |

## Cost comparison (approximate, verify current pricing before committing)

| Service | Current | GCP option | Notes |
| --- | --- | --- | --- |
| Compute | Vercel (plan cost + slowness) | Cloud Run: roughly $0 to $10/mo with `min-instances=1` | Free tier: 2M requests, 360k GB-seconds/month |
| Database | Neon (free tier or $19/mo Launch) | Cloud SQL: roughly $25 to $55/mo always-on, no scale-to-zero | Neon stays cheaper for this traffic, not migrating |
| Email | Resend (free tier likely) | No native GCP equivalent (SendGrid via Marketplace is the closest, not cheaper) | Not migrating |
| CI/CD | GitHub Actions (free) | GitHub Actions (free) | No change |

## Migration steps

1. **Dockerize the app.** ✅ `Dockerfile` (multi-stage: `npm ci` + `prisma generate` + `next build`, then a slim runner). Entrypoint is `npm start` → `NODE_ENV=production tsx server.ts`, not `next start` and not `output: "standalone"` — the app ships its own custom Node server (`server.ts`) that wraps Next's request handler in a plain `http.Server` and adds a `ws` WebSocket server for chat's live delivery, and standalone output doesn't trace custom server files. Because `server.ts` runs via `tsx` directly, the runner stage copies the full `src/` tree, not just `.next`.
2. **Swap attachment storage.** ✅ `src/lib/storage.ts` now branches on `GCS_BUCKET` (`@google-cloud/storage`) instead of `BLOB_READ_WRITE_TOKEN`. Same object-key generation and access-control pattern — `/api/attachments/[id]` stays the only gatekeeper, and the bucket is private (objects are always streamed through the server, never a public or signed URL).
3. **Set up Artifact Registry and Cloud Run.** One service for production (`rally`), one for preview (`rally-preview`). Cloud Run supports WebSockets natively; production deploys with `--min-instances=1` (already wanted for cold starts) so the one warm instance holds every open chat connection in memory with no extra pub/sub layer — preview runs with `--min-instances=0` since it doesn't need to be always warm. If this ever needs to scale past one instance, add Redis (Memorystore) pub/sub for cross-instance broadcast first — see `src/lib/realtime/registry.ts`.
4. **Move environment variables.** ✅ `.github/workflows/deploy.yml` and `deploy-preview.yml` set them as Cloud Run env vars at deploy time, sourced from GitHub Environment secrets/vars — same variable set as before, plus `GCS_BUCKET` replacing `BLOB_READ_WRITE_TOKEN`. See **Required GitHub configuration** below for the exact names and **one-time GCP setup** for what to provision before the first deploy.
5. **Set up Cloud Scheduler.** HTTP job hitting `/api/cron/due-notifications` with `Authorization: Bearer $CRON_SECRET`, daily at 08:00 UTC (matches `DUE_NOTIFY_HOUR`):
   ```sh
   gcloud scheduler jobs create http rally-due-notifications \
     --project="$GCP_PROJECT_ID" --location="$GCP_REGION" \
     --schedule="0 8 * * *" \
     --uri="https://<rally-cloud-run-url>/api/cron/due-notifications" \
     --http-method=GET \
     --headers="Authorization=Bearer $CRON_SECRET"
   ```
6. **Map custom domains.** `rally.grafikstudio.in` (prod) and `preview.rally.grafikstudio.in` (preview) to their Cloud Run services, update DNS.
7. **Rewrite CI workflows.** ✅ `.github/workflows/deploy.yml` and `deploy-preview.yml` no longer touch Vercel — each runs `prisma migrate deploy`, then `gcloud builds submit` (build the Dockerfile in Cloud Build) and `google-github-actions/deploy-cloudrun`, authenticated via Workload Identity Federation (no static key checked in). Trigger branches (`main`/`dev`) stay the same. `vercel.json` is deleted; the daily cron it declared is now Cloud Scheduler (step 5).
8. **Cut over, then decommission the Vercel project** once the new setup is verified end to end (magic link, forgot password, attachments, cron, invite links all working on the new domains).

## One-time GCP setup (before the first deploy)

Run once per project, from a machine with `gcloud auth login` already done:

```sh
export GCP_PROJECT_ID="<your-project-id>"
export GCP_REGION="<e.g. asia-south1>"
export GH_REPO="<org>/<repo>"          # e.g. grafikstudio/rally

gcloud config set project "$GCP_PROJECT_ID"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com iamcredentials.googleapis.com \
  cloudscheduler.googleapis.com storage.googleapis.com

# Artifact Registry repo for the built images
gcloud artifacts repositories create rally --repository-format=docker \
  --location="$GCP_REGION"

# Private bucket for attachments (uniform access, no public reads)
gcloud storage buckets create "gs://${GCP_PROJECT_ID}-rally-attachments" \
  --location="$GCP_REGION" --uniform-bucket-level-access
# → set GCS_BUCKET (GitHub var) to the bucket name above

# Deploy-time service account, used by both GitHub Actions and Cloud Run itself
gcloud iam service-accounts create rally-deployer --display-name="Rally deploy + runtime"
SA="rally-deployer@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
for role in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser roles/storage.objectAdmin; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="serviceAccount:$SA" --role="$role"
done

# Workload Identity Federation — lets GitHub Actions impersonate the SA with no long-lived key
gcloud iam workload-identity-pools create "github" --location=global
gcloud iam workload-identity-pools providers create-oidc "github" \
  --location=global --workload-identity-pool="github" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${GH_REPO}'"
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')/locations/global/workloadIdentityPools/github/attribute.repository/${GH_REPO}"

echo "GCP_WORKLOAD_IDENTITY_PROVIDER = projects/$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')/locations/global/workloadIdentityPools/github/providers/github"
echo "GCP_SERVICE_ACCOUNT = $SA"
```

## Required GitHub configuration

Set on the `production` and `preview` GitHub Environments (same scoping the old Vercel workflows used):

| Name | Kind | Notes |
| --- | --- | --- |
| `GCP_PROJECT_ID` | var | |
| `GCP_REGION` | var | e.g. `asia-south1` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | secret | from the one-time setup output above |
| `GCP_SERVICE_ACCOUNT` | secret | from the one-time setup output above |
| `DATABASE_URL` | secret | unchanged (Neon) |
| `AUTH_SECRET` | secret | unchanged |
| `EMAIL_SERVER` | secret | unchanged (Resend SMTP) |
| `EMAIL_FROM` | var | unchanged |
| `APP_URL` | var | the Cloud Run service URL (or custom domain once mapped) |
| `SEED_OWNER_EMAIL` | var | unchanged |
| `CRON_SECRET` | secret | unchanged; also used as the Cloud Scheduler bearer token |
| `DUE_NOTIFY_HOUR` | var | unchanged |
| `GCS_BUCKET` | var | bucket name from the one-time setup above |
| `SENTRY_DSN` | secret | unchanged |
| `NEXT_PUBLIC_SENTRY_DSN` | var | unchanged (not secret — public write-only key) |

## Deferred or not adopted

- **Cloud SQL.** Not worth it vs. Neon at this traffic level; always-on billing loses to Neon's autosuspend.
- **Google Cloud Source Repositories.** Discontinued for new users; GitHub stays the source of truth.
- **GKE / Kubernetes.** One app, no orchestration needed.
- **Compute Engine VM (self-managed).** More ops burden (patching, TLS, restarts, no autoscale) than Cloud Run for no cost benefit.
