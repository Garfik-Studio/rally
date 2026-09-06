# Production readiness

This checklist describes what must change or be verified before Rally is deployed for real users. It intentionally does not change the local-development setup: local Postgres, SMTP, filesystem attachments, and manually configured environment variables remain appropriate for development.

## Required before production

### Runtime and deployment

- Choose a deployment target that supports the Next.js version and runtime modes used by the application.
- Set `APP_URL` to the canonical HTTPS public URL. Ensure Auth.js uses the same origin and that redirect and invite URLs are tested there.
- Store all secrets in the deployment platform’s encrypted environment store; never put them in source control or client-visible environment variables.
- Set a strong, unique `AUTH_SECRET`, database credentials, SMTP credentials, and `CRON_SECRET`.
- Restrict the due-notification cron endpoint with `CRON_SECRET`; a production deployment must not leave it callable by the public internet.
- Define an owner-bootstrap procedure. `SEED_OWNER_EMAIL` is useful for initial setup, but the team must decide when it is removed or disabled after the owner is established.

### Database

- Use managed Postgres or an equivalently operated Postgres service with TLS, private credentials, automated backups, point-in-time recovery where available, and a documented restore procedure.
- Apply Prisma migrations as a controlled deployment step. Do not use development migration commands against the production database.
- Verify connection limits and pooling for the selected host and deployment runtime.
- Perform a restore rehearsal against a non-production database before launch.

### Attachments

`src/lib/storage.ts` writes to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set (Vercel sets this automatically once a Blob store is linked to the project) and falls back to the local filesystem otherwise, so local development needs no token. Object keys are server-generated (never the client filename or blob URL echoed back to other users).

- Downloads go through `/api/attachments/[id]`, which checks list access before fetching the blob server-side and streaming it back — blob URLs are never returned to the client.
- Per-file limit: 2MB (`MAX_ATTACHMENT_BYTES`). Per-task total: 5MB (`MAX_TASK_ATTACHMENTS_BYTES`), both enforced in `uploadAttachment` (`src/app/actions.ts`).
- Content-type allowlist (`ALLOWED_ATTACHMENT_TYPES` in `src/lib/storage.ts`) rejects anything outside common images, PDF, text/CSV, Office formats, zip, and JSON.
- Still open: lifecycle/retention/deletion policy matching the team's client and legal obligations.

### Email and Slack

- Production email goes through Brevo's SMTP relay (`EMAIL_SERVER=smtp://<login>:<key>@smtp-relay.brevo.com:587`, see `.env.example`) — no code depends on a specific provider, any SMTP-compatible service works.
- Use a real transactional email provider with a verified sending domain, SPF/DKIM/DMARC, rate limits, and a monitored sender address.
- Configure a production Slack webhook through encrypted configuration and define who may change it.
- Treat notification delivery as best effort unless delivery status, retries, and a dead-letter process are explicitly implemented. A failed email or Slack call must not roll back the user’s task or chat action.

### Security and access

- Audit every mutation and download route against the access-control rules in the architecture document, particularly guest list scoping and cross-workspace ID access.
- Password requirements (`src/lib/password-policy.ts`) and account recovery (`requestPasswordReset`/`resetPassword`) are implemented and tested. Still open: a process for revoking invites and exposed credentials at the org level.
- HTTPS/CSP/security headers are implemented: `src/proxy.ts` sets a per-request nonce'd Content-Security-Policy (`strict-dynamic` script-src; `style-src` allows `'unsafe-inline'` because the app's styling convention is inline `style={{}}`, which CSP has no nonce mechanism for); `next.config.ts` sets `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `Strict-Transport-Security`. Cookie/session settings still need a pass for the actual deployed domain (Auth.js cookie `secure`/`sameSite` defaults should be fine once `APP_URL` is HTTPS, but verify after deploy).
- Security-relevant events are logged via `logAudit` (`src/lib/audit.ts`) to the `AuditLog` table: invite creation/revocation/acceptance, role and space-membership changes, attachment upload/delete/access, and the Slack webhook change (logged as changed/cleared, never the URL value itself). No admin UI to browse this table yet — query it directly for now.

### Operations

- Error tracking: `@sentry/nextjs` is wired (`src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`) and no-ops until `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` are set — create a Sentry project and set those env vars to turn it on. Source-map upload (`withSentryConfig` in `next.config.ts`) isn't wired yet since it needs an org/project slug and auth token; add it once those exist.
- Uptime monitoring: `/api/health` checks DB connectivity and returns 503 on failure — point an external pinger (UptimeRobot, Better Stack, etc.) at it. No code left to write here, just the account/config step.
- Capture structured server logs with a request/correlation identifier and retain them long enough to investigate incidents.
- Monitor database health, cron execution, failed notification deliveries, and storage errors.
- Write a short incident runbook: how to roll back an app deployment, restore the database, rotate secrets, disable a compromised user, and communicate an outage.
- Name an owner for backups, secret rotation, dependency updates, and incident response.

## Recommended launch rehearsal

Before inviting real users, run this in a production-like environment:

1. Create an owner through the supported bootstrap path and verify invite-only onboarding.
2. Invite an Admin, Member, and Guest; confirm each sees only their intended spaces, lists, tasks, chat, and attachments.
3. Upload, download, and delete an attachment after a fresh deployment.
4. Verify password login, email delivery, Slack delivery, and protected cron execution.
5. Restore a backup into an isolated database and confirm the application can start against it.
6. Exercise the rollback and secret-rotation procedures.

## Deferred for now

CI, high availability, realtime infrastructure, background job queues, and formal service-level objectives are intentionally not prerequisites for the current local development phase. Reassess them when usage, deployment frequency, or notification volume makes the current approach insufficient.
