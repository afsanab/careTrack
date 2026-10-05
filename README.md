# CareTrack

A clinical workflow app for nursing homes, in production at a facility serving up to 100 residents. It tracks admissions and discharges and automatically schedules the physician visits each resident is due for. I built and maintain it as a freelance project. 

Previously nursing staff would call or text doctors 

[![CareTrack UI walkthrough](https://img.youtube.com/vi/6kJ9ejD63v0/hqdefault.jpg)](https://youtu.be/6kJ9ejD63v0)

*Walkthrough: admissions, census filters, physician tasks, and inviting staff.*

## Highlights

**Automatic visit scheduling.** A daily `node-cron` job creates each current resident's required physician tasks: an H&P due within 48 hours of admission, a 30-day visit, then recurring 60-day visits. Inserts use `ON CONFLICT DO NOTHING`, so reruns never create duplicates. Moving this to the server fixed a bug where new 60-day cycles only appeared after someone opened the patient's record.

**Security built around HIPAA's technical safeguards.**
- **Access control:** two roles, admissions staff and physicians, enforced in route middleware and by a database constraint, plus an idle-session timeout with a warning.
- **Authentication:** bcrypt password hashing, JWTs in httpOnly cookies, double-submit CSRF tokens, per-account lockout after repeated failed logins, and rate limiting on auth routes.
- **Audit controls:** every read or change of patient data is logged to Postgres, and optionally to an Azure append blob for tamper-resistant long-term retention.
- **Transmission security:** database connections must use TLS in production.

Software alone doesn't make an organization HIPAA compliant; vendor agreements and a risk analysis sit outside the code.

**Production setup.** The API ships as a multi-stage Docker image that runs as a non-root user with a health check. CI runs lint, tests, a build, and a dependency audit on Node 20 and 22 for every push.

**Accessibility.** Modals trap focus, close on Escape, and return focus to where you were.

## Features

- Admissions and discharges
- Census view with filters by status, physician, and facility
- Physician tasks with assignment, notes, and completion
- Staff invitations by email
- Admin user management, password resets, and forced password changes

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, Vite 7 |
| Backend | Node.js 20+, Express, PostgreSQL 15+, Zod, node-cron |
| Security | bcrypt, JWT, helmet, express-rate-limit, Winston audit logging |
| Testing and CI | Vitest, ESLint, GitHub Actions |
| Deployment | Docker, Azure Container Apps (API), Azure Static Web Apps (frontend) |

## Running locally

Requires Node 20.19+ and PostgreSQL 15+.

```bash
npm install                # installs both apps

cd caretrack-backend
cp .env.example .env       # set DATABASE_URL, JWT_SECRET, SEED_DEMO_PASSWORD (12+ characters)
npm run migrate
npm run seed               # optional demo data
npm run dev                # API on http://localhost:3001
```

In a second terminal:

```bash
cd admissions-app
npm run dev                # app on http://localhost:5173
```

After seeding, log in as `dr.smith`, `dr.patel`, `admin`, or `j.garcia` with your `SEED_DEMO_PASSWORD`. To create a real admin account, run `npm run create-admin` in `caretrack-backend`.

From the root, `npm test` runs both test suites and `npm run lint` lints the frontend.

## Project structure

```
careTrack/
├── admissions-app/        # React frontend (Vite)
├── caretrack-backend/     # Express API, migrations, scheduled jobs
└── .github/workflows/     # CI and frontend deployment
```

## Deployment

Pushing to `main` deploys the frontend to Azure Static Web Apps. The API is deployed to Azure Container Apps from the Azure Portal.
