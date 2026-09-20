# CareTrack

A HIPAA-compliant clinical workflow system for managing patient admissions and physician tasks in skilled nursing facilities.

---

## Project Structure

```
careTrack/
├── admissions-app/        # React frontend (Vite)
├── caretrack-backend/     # Node.js API (Express + Postgres)
├── .github/workflows/     # CI/CD pipelines
└── docs/                  # Deployment guide
```

---

## Quick Start

**Prerequisites:** Node 20.19+, Postgres 15+

### 1. Backend Setup

```bash
cd caretrack-backend
npm install
cp .env.example .env
# Edit .env: set DATABASE_URL, JWT_SECRET, SEED_DEMO_PASSWORD (≥12 chars)
npm run migrate
npm run seed              # Optional: creates demo data
npm run dev               # Starts on http://localhost:3001
```

### 2. Frontend Setup

```bash
cd admissions-app
npm install
npm run dev              # Starts on http://localhost:5173
```

**Demo Accounts:** After seeding, log in with `dr.smith`, `dr.patel`, `admin`, or `j.garcia` using the password you set in `SEED_DEMO_PASSWORD`.

---

## Tech Stack

**Frontend:** React 19, Vite 7  
**Backend:** Node.js 20+, Express, Postgres 15+  
**Security:** JWT (httpOnly cookies), CSRF protection, bcrypt, helmet, rate limiting  
**Testing:** Vitest  
**Validation:** Zod schemas  
**Audit Logging:** Winston → file + database + optional Azure Blob  
**Deployment:** Azure Container Apps + Azure Static Web Apps

---

## Key Features

### Security & Compliance
- JWT authentication with httpOnly cookies and CSRF protection
- Account lockout after failed login attempts
- Comprehensive audit logging (all PHI access tracked)
- Request validation on all endpoints
- Idle session timeout (25 min warning, 5 min grace period)
- SSL/TLS enforcement for database connections
- Optional Azure Blob Storage for immutable audit logs

### Clinical Workflow
- Patient admissions tracking
- Physician task management
- Multi-facility support
- Admin user management
- Forced password change capability

---

## Development

### Run Tests
```bash
npm test                 # Run all tests
npm run lint             # Lint frontend code
```

### Create Admin User
```bash
cd caretrack-backend
npm run create-admin
```

---

## CI/CD

Automated workflows run on every push:
- **CI:** Lint, test, build, security audit (Node 20 & 22)
- **CD:** Manual deploy to Azure (backend + frontend)

