// Single entrypoint for `npm test` / CI. Add a line here whenever a new
// tests/<module>/*.test.ts file is added — node:test registers suites as a
// side effect of importing them.
import "./unit/password-policy.test";
import "./integration/rbac.test";
