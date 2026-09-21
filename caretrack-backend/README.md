# CareTrack API

Express + PostgreSQL. Local setup and demo logins are in the [project README](../README.md).

```
src/server.js          entry
src/routes/            HTTP routes
src/controllers/       auth, patients, tasks, users, invitations
src/middleware/        JWT, CSRF, audit, errors
src/services/          sessions, lockout, scheduler, invite email
src/schemas.js         Zod request validation
src/db/pool.js         Postgres pool
migrations/            schema, seed (dev only), create-admin
```

```bash
npm run migrate        # apply SQL migrations
npm run seed           # demo users/patients (never production)
npm run create-admin   # first production admin
npm run dev            # http://localhost:3001
npm test
```

Copy `.env.example` to `.env`. Local Postgres uses `DB_*`. Production uses `DATABASE_URL` plus `JWT_SECRET` from Key Vault. `SEED_DEMO_PASSWORD` is the shared password for seeded accounts only.

---

## API (`/api`)

Auth is an httpOnly `caretrack_session` cookie plus a readable `caretrack_csrf` cookie. Send `credentials: "include"` and echo the CSRF value as `X-CSRF-Token` on POST/PATCH/DELETE.

| Method | Path | Who | What |
|--------|------|-----|------|
| POST | `/auth/login` | public | session + CSRF cookies |
| POST | `/auth/logout` | auth | clear cookies |
| GET | `/auth/me` | auth | current user |
| POST | `/auth/change-password` | auth | change own password |
| GET | `/auth/invite-info` | public | look up invite token |
| POST | `/auth/register` | public | accept invite, create account |
| GET | `/patients` | both | list (physicians see own) |
| GET | `/patients/:id` | both | detail |
| POST | `/patients` | both | create |
| PATCH | `/patients/:id` | admin | update |
| POST | `/patients/:id/admit` | admin | mark In House |
| POST | `/patients/:id/discharge` | admin | discharge, cancel tasks |
| DELETE | `/patients/:id` | admin | delete pending |
| GET | `/patients/:id/tasks` | both | list tasks |
| POST | `/patients/:id/tasks` | admin | create/upsert |
| PATCH | `/patients/:id/tasks/:taskId/assign` | admin | assign |
| PATCH | `/patients/:id/tasks/:taskId/complete` | physician | complete |
| PATCH | `/patients/:id/tasks/:taskId/note` | admin | note |
| GET | `/users` | admin | list |
| PATCH | `/users/:id` | admin | update |
| POST | `/users/:id/reset-password` | admin | reset (forces change) |
| POST | `/invitations` | admin | create invite |
| GET | `/invitations` | admin | list |
| DELETE | `/invitations/:id` | admin | revoke |
| GET | `/health` | public | liveness |
| GET | `/health?deep=1` | public | also pings Postgres |
