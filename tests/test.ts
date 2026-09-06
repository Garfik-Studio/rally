// Single entrypoint for `npm test` / CI. Add a line here whenever a new
// tests/<module>/*.test.ts file is added — node:test registers suites as a
// side effect of importing them. Unit suites are pure (no DB); integration
// suites need the local dev Postgres (DATABASE_URL) running.
//
// Must be first: loads DATABASE_URL into env before any module pulls in
// @/lib/prisma (the pg adapter reads the connection string at import time).
import "dotenv/config";

import "./unit/password-policy.test";
import "./unit/password-strength.test";
import "./unit/mentions.test";
import "./unit/attachment-format.test";
import "./unit/mailer.test";
import "./unit/rally-app-data.test";

import "./integration/rbac.test";
import "./integration/tasks.test";
import "./integration/invites.test";
import "./integration/notifications.test";
import "./integration/data-loaders.test";
