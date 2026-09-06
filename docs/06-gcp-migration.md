# GCP infrastructure migration

## Goal

Move **production** compute and CI/CD off Vercel to fix latency, reduce cost, and get real WebSocket chat delivery. `dev` stays on Vercel as the preview environment — cheap, disposable, no GCP resources to run 24/7 for something that doesn't need to be always-warm. Keep Neon (Postgres) and Resend (email) everywhere: neither is tied to a host, and both are cheaper and simpler to keep than to replace.

## Decision

- **Keep Neon.** Usage-based, autosuspend-to-zero billing beats an always-on Cloud SQL instance at this traffic level. No code change: it's reached over the public internet the same way from Cloud Run, Vercel, or anywhere else.
- **Keep Resend.** Not tied to any host; it's an SMTP/API call from application code. Free tier (3,000 emails/month) covers current volume.
- **Production moves to GCP, preview stays on Vercel.** `main` → Cloud Run (Docker); `dev` → Vercel, unchanged deploy shape. One real consequence: Vercel can't host a custom server or hold a WebSocket connection open, so the preview deploy runs on plain `next start` and loses live chat push / desktop notifications (chat itself still works, just without the realtime piece) — production is the only environment with the full feature set.

## Target architecture

| Concern | `dev` (Vercel, preview) | `main` (GCP, production) |
| --- | --- | --- |
| App hosting | Vercel serverless functions, `next build` output | Cloud Run (Docker container running the custom `server.ts`, not `next start` — see below) |
| Realtime chat | Not available (Vercel can't hold the WebSocket open) | Full WebSocket push |
| Cold starts | Vercel default | `--min-instances=1` keeps one warm instance |
| Cron (`due-notifications`) | n/a (cron only needs to run once, from production) | Cloud Scheduler, HTTP job with `CRON_SECRET` bearer header |
| Docker image storage | n/a | Artifact Registry |
| CI/CD | GitHub Actions + `vercel deploy` (unchanged) | GitHub Actions + `gcloud run deploy` |
| Attachments | Local disk fallback, or Cloud Storage if `GCS_BUCKET`/`GCS_CREDENTIALS_JSON` are set in the Vercel project too | Cloud Storage (`@google-cloud/storage`), via the Cloud Run service account, no key needed |
| Custom domain | `preview.rally.grafikstudio.in` → Vercel | `rally.grafikstudio.in` → Cloud Run domain mapping |
| Database | Neon (unchanged) | Neon (unchanged) |
| Email | Resend SMTP (unchanged) | Resend SMTP (unchanged) |
| Source control | GitHub (unchanged) | GitHub (unchanged) |

## Cost comparison (approximate, verify current pricing before committing)

| Service | Current | GCP option | Notes |
| --- | --- | --- | --- |
| Compute | Vercel (plan cost + slowness) | Cloud Run: roughly $0 to $10/mo with `min-instances=1` | Free tier: 2M requests, 360k GB-seconds/month |
| Database | Neon (free tier or $19/mo Launch) | Cloud SQL: roughly $25 to $55/mo always-on, no scale-to-zero | Neon stays cheaper for this traffic, not migrating |
| Email | Resend (free tier likely) | No native GCP equivalent (SendGrid via Marketplace is the closest, not cheaper) | Not migrating |
| CI/CD | GitHub Actions (free) | GitHub Actions (free) | No change |

## Migration steps

1. **Dockerize the app.** (done) `Dockerfile` (multi-stage: `npm ci` + `prisma generate` + `next build`, then a slim runner). Entrypoint is `npm start` → `NODE_ENV=production tsx server.ts`, not `next start` and not `output: "standalone"` — the app ships its own custom Node server (`server.ts`) that wraps Next's request handler in a plain `http.Server` and adds a `ws` WebSocket server for chat's live delivery, and standalone output doesn't trace custom server files. Because `server.ts` runs via `tsx` directly, the runner stage copies the full `src/` tree, not just `.next`.
2. **Swap attachment storage.** (done) `src/lib/storage.ts` now branches on `GCS_BUCKET` (`@google-cloud/storage`) instead of `BLOB_READ_WRITE_TOKEN`. Same object-key generation and access-control pattern — `/api/attachments/[id]` stays the only gatekeeper, and the bucket is private (objects are always streamed through the server, never a public or signed URL).
3. **Set up Artifact Registry and Cloud Run.** One service, `rally`, production only — `dev`/preview stays on Vercel (see Goal above), so there's no `rally-preview` Cloud Run service to run 24/7. Cloud Run supports WebSockets natively; deploys with `--min-instances=1` (already wanted for cold starts) so the one warm instance holds every open chat connection in memory with no extra pub/sub layer. If this ever needs to scale past one instance, add Redis (Memorystore) pub/sub for cross-instance broadcast first — see `src/lib/realtime/registry.ts`.
4. **Move environment variables.** (done) `.github/workflows/deploy.yml` and `deploy-preview.yml` set them as Cloud Run env vars at deploy time, sourced from GitHub Environment secrets/vars — same variable set as before, plus `GCS_BUCKET` replacing `BLOB_READ_WRITE_TOKEN`. See **Required GitHub configuration** below for the exact names and **one-time GCP setup** for what to provision before the first deploy.
5. **Set up Cloud Scheduler.** HTTP job hitting `/api/cron/due-notifications` with `Authorization: Bearer $CRON_SECRET`, once daily at 08:00 UTC (matches `DUE_NOTIFY_HOUR`). `--time-zone` and `--max-retry-attempts` are pinned explicitly below rather than left on their gcloud defaults (which happen to already be UTC / no-retry) — a future CLI default change shouldn't be able to make this fire more than once a day:
   ```sh
   gcloud scheduler jobs create http rally-due-notifications \
     --project="$GCP_PROJECT_ID" --location="$GCP_REGION" \
     --schedule="0 8 * * *" --time-zone="Etc/UTC" \
     --max-retry-attempts=0 \
     --uri="https://<rally-cloud-run-url>/api/cron/due-notifications" \
     --http-method=GET \
     --headers="Authorization=Bearer $CRON_SECRET"
   ```
   Three independent layers make this safe even if something ever calls the endpoint more than once in a day (a manual `curl`, a second Scheduler job created by mistake, etc.): the schedule itself only fires once/day, the route in `src/app/api/cron/due-notifications/route.ts` no-ops outside the `DUE_NOTIFY_HOUR` hour, and `checkDueDateNotifications` (`src/app/actions.ts`) checks for an existing `Notification` row for that user/task/day before sending — so a duplicate invocation can't double-notify anyone.
6. **Map the production domain.** `rally.grafikstudio.in` → the Cloud Run service. `preview.rally.grafikstudio.in` stays pointed at Vercel, unchanged.
7. **Rewrite the production CI workflow.** (done) `.github/workflows/deploy.yml` (triggered on `main`) no longer touches Vercel — it runs `prisma migrate deploy`, then `gcloud builds submit` (build the Dockerfile in Cloud Build) and `google-github-actions/deploy-cloudrun`, authenticated via Workload Identity Federation (no static key checked in). `.github/workflows/deploy-preview.yml` (triggered on `dev`) is unchanged from before — still `vercel deploy`. `vercel.json`'s cron is deleted since it only ever needs to fire from production, which is now Cloud Scheduler (step 5); Vercel Cron never ran on preview deployments anyway.
8. **Cut over production, verify, done.** No Vercel project decommissioning — it keeps serving `dev`/preview. Verify end to end on the new production domain: magic link, forgot password, attachments, cron, invite links, live chat.

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

# Deploy-time service account, used by both GitHub Actions and Cloud Run itself.
# storage.admin (not just objectAdmin) is required: `gcloud builds submit`
# auto-creates a "<project>_cloudbuild" staging bucket on first use, which
# needs storage.buckets.create/get — objectAdmin alone 403s on that.
# cloudbuild.builds.editor is separate from the storage roles above — it's
# what actually lets the SA call builds.create, not just upload the source.
# logging.viewer is what lets `gcloud builds submit` stream build logs back
# to the CI job (see cloudbuild.yaml's CLOUD_LOGGING_ONLY comment) — without
# it, the default GCS log bucket only streams to legacy project Viewer/Owner
# and the command hangs ~5min before failing.
gcloud iam service-accounts create rally-deployer --display-name="Rally deploy + runtime"
SA="rally-deployer@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
for role in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser roles/storage.admin roles/cloudbuild.builds.editor roles/logging.viewer; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="serviceAccount:$SA" --role="$role"
done

# The above only covers the identity that *calls* `gcloud builds submit`. The
# build itself (fetching the uploaded source, running the docker build step,
# pushing the image, writing logs) executes as the project's default Compute
# Engine service account, not $SA — and on projects created after Google
# stopped auto-granting it Editor, it starts with zero roles and 403s on all
# of that.
CB_SA="$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
for role in roles/storage.objectViewer roles/artifactregistry.writer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="serviceAccount:$CB_SA" --role="$role"
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

### `production` GitHub Environment (deploys to Cloud Run)

| Name | Kind | Notes |
| --- | --- | --- |
| `GCP_PROJECT_ID` | var | |
| `GCP_REGION` | var | e.g. `asia-south1` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | secret | from the one-time setup output above |
| `GCP_SERVICE_ACCOUNT` | secret | from the one-time setup output above |
| `DATABASE_URL` | secret | Neon connection string for the production database |
| `AUTH_SECRET` | secret | |
| `EMAIL_SERVER` | secret | Resend SMTP |
| `EMAIL_FROM` | var | |
| `APP_URL` | var | the Cloud Run service URL (or custom domain once mapped) |
| `SEED_OWNER_EMAIL` | var | |
| `CRON_SECRET` | secret | also used as the Cloud Scheduler bearer token |
| `DUE_NOTIFY_HOUR` | var | |
| `GCS_BUCKET` | var | bucket name from the one-time setup above |
| `SENTRY_DSN` | secret | |
| `NEXT_PUBLIC_SENTRY_DSN` | var | not secret — public write-only key |

### `preview` GitHub Environment (deploys to Vercel, unchanged from before)

| Name | Kind | Notes |
| --- | --- | --- |
| `VERCEL_TOKEN` | secret | |
| `VERCEL_ORG_ID` | secret | |
| `VERCEL_PROJECT_ID` | secret | |

These three only authenticate the `vercel deploy` call itself. The app's own runtime env vars for preview (`DATABASE_URL`, `APP_URL`, `AUTH_SECRET`, `EMAIL_SERVER`, `EMAIL_FROM`, `SEED_OWNER_EMAIL`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, and optionally `GCS_BUCKET` + `GCS_CREDENTIALS_JSON` if you want attachments to work in preview too) live in the **Vercel project's own dashboard** (Settings → Environment Variables, scoped to Preview) — GitHub Environment secrets aren't passed through to a Vercel deploy automatically.

## Deferred or not adopted

- **Cloud SQL.** Not worth it vs. Neon at this traffic level; always-on billing loses to Neon's autosuspend.
- **Google Cloud Source Repositories.** Discontinued for new users; GitHub stays the source of truth.
- **GKE / Kubernetes.** One app, no orchestration needed.
- **Compute Engine VM (self-managed).** More ops burden (patching, TLS, restarts, no autoscale) than Cloud Run for no cost benefit.
