# Cloud Run entrypoint. Ships the app's own custom server (server.ts) instead
# of `next start` — see docs/06-gcp-migration.md. server.ts runs directly via
# tsx (no separate server build step), so the full src/ tree ships too, not
# just the .next output.
FROM node:22-slim AS builder
WORKDIR /app

# Prisma's query engine needs libssl at build (generate) and run time.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# --ignore-scripts: the postinstall runs `prisma generate`, which needs the
# schema + prisma7.config.ts that aren't copied yet. Run it explicitly below.
RUN npm ci --ignore-scripts

COPY . .
RUN npx prisma generate

# `next build` evaluates route modules (NextAuth's Nodemailer provider, the
# Prisma client) to collect page data, so these must be set. Inline placeholders
# only — not baked into the image, never read at runtime. Cloud Run injects the
# real values.
#
# NEXT_PUBLIC_SENTRY_DSN is different: Next.js inlines NEXT_PUBLIC_* vars into
# the client bundle at build time, not at container start, so it can't just be
# a Cloud Run runtime env var like the others — it has to be a build arg (see
# cloudbuild.yaml). Not a secret (Sentry DSNs are write-only, safe to bake in).
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
RUN AUTH_SECRET=build-only-not-a-real-secret \
    DATABASE_URL=postgresql://user:pass@localhost:5432/build \
    EMAIL_SERVER=smtp://user:pass@localhost:1025 \
    EMAIL_FROM="Rally <no-reply@rally.local>" \
    npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/prisma7.config.ts ./prisma7.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "start"]
