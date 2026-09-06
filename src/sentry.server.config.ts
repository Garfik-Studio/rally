import * as Sentry from "@sentry/nextjs";

// No-ops without SENTRY_DSN set — safe to leave unconfigured in dev.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
