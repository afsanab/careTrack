# Production Readiness Checklist

Tracks the gap between "the app works" and "it's safe to put real PHI in it."
Items prefixed with **(code)** are in source control; items prefixed with
**(ops)** are out-of-band tasks for the operator.

---

## Completed in code

- [x] **(code)** Env-var validation on boot — `src/config.js` fails fast on
      missing/short `JWT_SECRET`, missing DB config, missing CORS origins.
- [x] **(code)** Strict DB SSL with verification, with opt-out only for
      local dev (`DB_SSL_STRICT`).
- [x] **(code)** Graceful shutdown — SIGTERM/SIGINT close HTTP server,
      stop scheduled jobs, drain DB pool.
- [x] **(code)** Deep `/api/health?deep=1` pings Postgres.
- [x] **(code)** JWT moved to **httpOnly** session cookie + CSRF
      double-submit (`X-CSRF-Token` header). No tokens in JS storage.
- [x] **(code)** Per-account login lockout (`LOCKOUT_MAX_ATTEMPTS`,
      `LOCKOUT_WINDOW_MIN`, `LOCKOUT_DURATION_MIN`) + login attempt
      history table.
- [x] **(code)** Forced password change after admin reset
      (`must_change_password`).
- [x] **(code)** `zod` request validation on every route, with UUID
      checks on every `:id` param (SQL-injection guard for path params).
- [x] **(code)** Pagination on `GET /patients` and `GET /users`.
- [x] **(code)** Audit events persisted to `audit_log` table + optional
      Azure Blob append-only shipping.
- [x] **(code)** Audit + login-attempts retention purge jobs.
- [x] **(code)** Server-side scheduled task generation — recurring 60-day
      tasks no longer depend on someone opening the patient.
- [x] **(code)** Frontend idle-session timeout with warning dialog.
- [x] **(code)** Frontend `ErrorBoundary` at the SPA root.
- [x] **(code)** `window.confirm` removed in favour of styled modals.
- [x] **(code)** `staticwebapp.config.json` with HSTS, CSP, X-Frame-Options,
      Referrer-Policy, Permissions-Policy.
- [x] **(code)** GitHub Actions CI: lint + test + build + `npm audit` for
      both packages on Node 20 and 22.
- [x] **(code)** Production `Dockerfile` for the API (Node 20, non-root user,
      healthcheck) + `.dockerignore`.
- [x] **(code)** Production-safe first-admin bootstrap (`npm run create-admin`)
      so the initial administrator can be created without the dev seed.
- [x] **(code)** Frontend `engines.node`, production env example,
      `<title>`, favicon, theme color, `noindex`.

---

## Operator action required before go-live

### Secrets

- [ ] **(ops)** Rotate the live database credentials (e.g. managed Postgres).
- [ ] **(ops)** Rotate the live Resend API key.
- [ ] **(ops)** Regenerate `JWT_SECRET` (64 bytes hex).
- [ ] **(ops)** Store the new values in **Azure Key Vault** and grant the app's
      managed identity **Key Vault Secrets User**. After rotating a secret,
      restart the Container App revision so replicas pick up the new value.

### Azure infrastructure

- [ ] **(ops)** Create Azure Database for PostgreSQL Flexible Server with
      SSL required and public access disabled.
- [ ] **(ops)** Create the Container App with Managed Identity granted read on
      Key Vault.
- [ ] **(ops)** Private endpoints for Postgres and Blob Storage; VNet
      integration on the Container Apps environment.
- [ ] **(ops)** Create the Blob container `caretrack-audit-logs` with a
      7-year immutability policy.
- [ ] **(ops)** Enable Azure Defender for PostgreSQL.
- [ ] **(ops)** Configure Azure Monitor alerts: failed login spikes,
      account lockouts, 5xx rate, DB CPU > 80%, blob shipping failures.
- [ ] **(ops)** Set `ALLOWED_ORIGINS` to the production SWA URL only.
- [ ] **(ops)** Set `APP_PUBLIC_URL` to the production SWA URL — the API
      refuses to boot in production without it.
- [ ] **(ops)** Create the first admin against the production DB with
      `npm run create-admin` (see `caretrack-backend/README.md`), then invite
      the rest of the team from the UI.
- [ ] **(ops)** Wire the CD workflow secrets and variables, then enable the
      `push` trigger if you want auto-deploy.

### HIPAA paperwork

- [ ] **(ops)** Signed Business Associate Agreement with Microsoft Azure.
- [ ] **(ops)** Signed BAA with any other PHI-touching vendor (Resend,
      Sentry/App Insights, etc.) — or replace them with a vendor that has
      one.
- [ ] **(ops)** Documented risk analysis per §164.308(a)(1).
- [ ] **(ops)** Documented policies & procedures, incident response runbook.
- [ ] **(ops)** Workforce HIPAA training records.
- [ ] **(ops)** Annual external audit scheduled.

---

## Deferred to a follow-up PR

- [ ] **(code)** MFA (TOTP) enrollment + login challenge + recovery codes.
- [ ] **(code)** Observability — wire Sentry or Azure Application Insights
      into both the SPA `ErrorBoundary.onError` and the backend
      `errorHandler`.
- [ ] **(code)** Frontend component tests (login flow, accept-invite flow,
      task panel happy path) with React Testing Library.
- [ ] **(code)** Backend integration tests with `supertest` + a throwaway
      Postgres (testcontainers) covering auth, role gates, discharge
      cascade.
- [ ] **(code)** OpenAPI document generated from `src/schemas.js`.
- [ ] **(code)** Soft-delete viewer for discharged patients (regulatory
      access) — currently filtered out everywhere.
- [ ] **(code)** Pagination UI on the patient list.
- [ ] **(code)** Self-serve password reset via email-verified link.
