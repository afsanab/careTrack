# CareTrack Backend

Node.js + Express + PostgreSQL backend for the CareTrack nursing home admissions and clinical task management system. Designed for deployment on **Microsoft Azure** with HIPAA compliance in mind.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Local Development Setup](#local-development-setup)
4. [Azure Production Setup](#azure-production-setup)
5. [API Reference](#api-reference)
6. [Frontend Integration](#frontend-integration)
7. [HIPAA Compliance Checklist](#hipaa-compliance-checklist)
8. [Security Notes](#security-notes)

---

## Architecture Overview

```
React Frontend (Azure Static Web Apps)
        │
        │ HTTPS (TLS 1.2+)
        ▼
Express API (Azure App Service)
        │
        ├── Azure Database for PostgreSQL – Flexible Server
        │     Encryption at rest, private VNet, SSL enforced
        │
        ├── Azure Key Vault
        │     JWT secret, DB password, connection strings
        │
        └── Azure Blob Storage
              Immutable HIPAA audit logs
```

---

## Project Structure

```
caretrack-backend/
├── src/
│   ├── server.js                  # Express app entry point
│   ├── routes/
│   │   └── index.js               # All route definitions
│   ├── controllers/
│   │   ├── authController.js      # Login, logout, password change
│   │   ├── patientsController.js  # Patient CRUD, admit, discharge
│   │   ├── tasksController.js     # Task assign, complete, notes
│   │   └── usersController.js     # User management (admin only)
│   ├── middleware/
│   │   ├── auth.js                # JWT verification, role guards
│   │   ├── audit.js               # HIPAA audit logger
│   │   └── errorHandler.js        # Centralized error handling
│   ├── services/                  # session/CSRF, lockout, scheduler, invite email
│   ├── schemas.js                 # zod request/response schemas
│   └── db/
│       └── pool.js                # PostgreSQL connection pool
├── migrations/
│   ├── 001_initial_schema.sql     # Full DB schema
│   ├── run.js                     # Migration runner
│   ├── seed.js                    # Dev seed data (never run in production)
│   └── create-admin.js            # Bootstrap the first admin (safe in production)
├── logs/                          # Local audit logs (auto-created)
├── Dockerfile                     # Production container image (Node 20)
├── .env.example                   # Environment variable template
└── package.json
```

---

## Local Development Setup

### Prerequisites
- Node.js 20.19+ (or current Node 22 LTS)
- PostgreSQL 15+ running locally (or use Docker)

### 1. Install dependencies
```bash
npm install
```

### 2. Create your `.env` file
```bash
cp .env.example .env
```

Edit `.env` with your local PostgreSQL credentials:
```
NODE_ENV=development
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=caretrack
DB_USER=postgres
DB_PASSWORD=your_local_password
DB_SSL=false
JWT_SECRET=generate_a_64_byte_hex_string_here
ALLOWED_ORIGINS=http://localhost:5173
```

Generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Create the database
```bash
psql -U postgres -c "CREATE DATABASE caretrack;"
```

### 4. Run migrations
```bash
npm run migrate
```

### 5. Seed demo data
```bash
npm run seed
```

Demo accounts created by the seed: **dr.smith**, **dr.patel**, **admin**, **j.garcia**. Set **`SEED_DEMO_PASSWORD`** in `.env` (≥12 characters) before `npm run seed`; all seeded users share that password. It is never printed or committed.

### 6. Start the server
```bash
npm run dev     # Development (with nodemon auto-reload)
npm start       # Production
```

API will be available at `http://localhost:3001/api`

---

## Azure Production Setup

### Step 1: Create an Azure PostgreSQL Flexible Server

```bash
az postgres flexible-server create \
  --resource-group caretrack-rg \
  --name caretrack-db \
  --location eastus \
  --admin-user caretrackadmin \
  --admin-password "YOUR_STRONG_PASSWORD" \
  --sku-name Standard_B2ms \
  --tier Burstable \
  --version 15 \
  --storage-size 32 \
  --backup-retention 35 \
  --geo-redundant-backup Enabled \
  --public-access None
```

**Important settings to verify in the Azure portal:**
- SSL enforcement: **Required**
- Backup retention: **35 days** (HIPAA recommends 6 years — configure long-term backup separately)
- Private endpoint or VNet integration: **Enabled**
- Azure Defender for PostgreSQL: **Enabled**

### Step 2: Create Azure Key Vault

```bash
az keyvault create \
  --name caretrack-vault \
  --resource-group caretrack-rg \
  --location eastus \
  --enable-purge-protection true \
  --retention-days 90
```

Store your secrets:
```bash
az keyvault secret set --vault-name caretrack-vault --name "JWT-SECRET" --value "your_jwt_secret"
az keyvault secret set --vault-name caretrack-vault --name "DB-PASSWORD" --value "your_db_password"
```

### Step 3: Create Azure Blob Storage for Audit Logs

```bash
az storage account create \
  --name caretrackaudit \
  --resource-group caretrack-rg \
  --location eastus \
  --sku Standard_GRS \
  --kind StorageV2 \
  --min-tls-version TLS1_2

az storage container create \
  --name caretrack-audit-logs \
  --account-name caretrackaudit \
  --public-access off
```

Enable immutability policy (HIPAA requires tamper-proof audit logs):
```bash
az storage container immutability-policy create \
  --account-name caretrackaudit \
  --container-name caretrack-audit-logs \
  --period 2557   # 7 years in days (HIPAA requirement)
```

### Step 4: Deploy to Azure App Service

```bash
az appservice plan create \
  --name caretrack-plan \
  --resource-group caretrack-rg \
  --sku B2 \
  --is-linux

az webapp create \
  --name caretrack-api \
  --resource-group caretrack-rg \
  --plan caretrack-plan \
  --runtime "NODE:20-lts"
```

> The app requires Node 20.19+ (Node 22 LTS also supported). Do **not** use the
> Node 18 runtime — the toolchain depends on APIs added in Node 20.

Enable Managed Identity (so App Service can pull secrets from Key Vault without credentials in code):
```bash
az webapp identity assign \
  --name caretrack-api \
  --resource-group caretrack-rg
```

Grant the identity read access to Key Vault. If the vault uses **RBAC
authorization** (recommended — see
[docs/Azure-KeyVault-App-Service.md](../docs/Azure-KeyVault-App-Service.md)),
assign the **Key Vault Secrets User** role:
```bash
PRINCIPAL_ID=$(az webapp identity show --name caretrack-api --resource-group caretrack-rg --query principalId -o tsv)
VAULT_ID=$(az keyvault show --name caretrack-vault --resource-group caretrack-rg --query id -o tsv)

az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee-object-id "$PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --scope "$VAULT_ID"
```

Set App Service environment variables (reference Key Vault using `@Microsoft.KeyVault(...)` syntax):
```bash
az webapp config appsettings set \
  --name caretrack-api \
  --resource-group caretrack-rg \
  --settings \
    NODE_ENV=production \
    PORT=8080 \
    DB_HOST=caretrack-db.postgres.database.azure.com \
    DB_NAME=caretrack \
    DB_USER=caretrackadmin \
    DB_SSL=true \
    DB_PASSWORD="@Microsoft.KeyVault(VaultName=caretrack-vault;SecretName=DB-PASSWORD)" \
    JWT_SECRET="@Microsoft.KeyVault(VaultName=caretrack-vault;SecretName=JWT-SECRET)" \
    JWT_EXPIRES_IN=8h \
    ALLOWED_ORIGINS=https://your-app.azurestaticapps.net \
    AZURE_STORAGE_CONNECTION_STRING="your_storage_connection_string" \
    AZURE_AUDIT_CONTAINER=caretrack-audit-logs
```

### Step 5: Run migrations against Azure PostgreSQL

```bash
# Temporarily whitelist your IP to run migrations
az postgres flexible-server firewall-rule create \
  --resource-group caretrack-rg \
  --name caretrack-db \
  --rule-name temp-deploy \
  --start-ip-address YOUR_IP \
  --end-ip-address YOUR_IP

# Run migrations
DB_HOST=caretrack-db.postgres.database.azure.com \
DB_USER=caretrackadmin \
DB_PASSWORD=YOUR_PASSWORD \
DB_SSL=true \
node migrations/run.js

# Remove the temporary firewall rule
az postgres flexible-server firewall-rule delete \
  --resource-group caretrack-rg \
  --name caretrack-db \
  --rule-name temp-deploy
```

### Step 6: Create the first admin

`npm run seed` is dev-only and must never touch production. To bootstrap the
first administrator (who then invites everyone else from the UI), run the
production-safe `create-admin` script once against the production database.
Pass credentials as environment variables so the password stays out of shell
history:

```bash
ADMIN_USERNAME=jane.admin \
ADMIN_PASSWORD='a-long-unique-password' \
ADMIN_FULL_NAME='Jane Admin' \
DATABASE_URL='postgresql://...sslmode=require' \
JWT_SECRET='<your 64-byte hex>' \
ALLOWED_ORIGINS='https://your-app.azurestaticapps.net' \
npm run create-admin
```

It refuses to overwrite an existing username; use the in-app admin
password-reset flow to change an existing user's password.

### Optional: run as a container

A production `Dockerfile` is included (Node 20, non-root, healthcheck). Build
and run locally with:

```bash
docker build -t caretrack-api ./caretrack-backend
docker run --rm -p 8080:8080 --env-file caretrack-backend/.env caretrack-api
```

App Service for Containers and Azure Container Apps can both deploy this image.

### Optional: continuous deployment

`.github/workflows/deploy-backend.yml` (App Service) and
`.github/workflows/deploy-frontend.yml` (Static Web Apps) are included as
manually-triggered pipelines. Add the documented secrets/variables and switch
on the `push` trigger when you're ready for automatic deploys.

---

## API Reference

All endpoints are prefixed with `/api`.

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | None | Login — sets session + CSRF cookies |
| POST | `/auth/logout` | Required | Logout (clears cookies, logs event) |
| GET | `/auth/me` | Required | Get current user |
| POST | `/auth/change-password` | Required | Change own password |
| GET | `/auth/invite-info` | None | Look up an invitation by token |
| POST | `/auth/register` | None | Accept an invitation and create the account |

**Login request:**
```json
{ "username": "dr.smith", "password": "<your password>" }
```

**Login response** — the JWT is delivered as an **httpOnly `caretrack_session`
cookie** (not in the body), alongside a readable `caretrack_csrf` cookie. The
body carries only the user shape:
```json
{
  "user": {
    "id": "...",
    "username": "dr.smith",
    "role": "physician",
    "fullName": "Dr. James Smith",
    "mustChangePassword": false
  },
  "expiresIn": "8h"
}
```

All state-changing requests must include the CSRF cookie value in the
`X-CSRF-Token` header.

### Patients

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/patients` | Both | List patients (physicians scoped to own) |
| GET | `/patients/:id` | Both | Get patient detail |
| POST | `/patients` | Both | Create patient |
| PATCH | `/patients/:id` | Admin | Update patient |
| POST | `/patients/:id/admit` | Admin | Mark In House |
| POST | `/patients/:id/discharge` | Admin | Discharge + cancel tasks |
| DELETE | `/patients/:id` | Admin | Remove pending patient |

**Query params for GET /patients:** `?status=inhouse&physician=dr.smith&location=Sunrise+Care+Center`

### Tasks

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/patients/:id/tasks` | Both | List tasks for patient |
| POST | `/patients/:id/tasks` | Admin | Create/upsert task |
| PATCH | `/patients/:id/tasks/:taskId/assign` | Admin | Assign task |
| PATCH | `/patients/:id/tasks/:taskId/complete` | Physician | Mark complete |
| PATCH | `/patients/:id/tasks/:taskId/note` | Admin | Update note |

### Users (Admin only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users` | List all users (paginated) |
| PATCH | `/users/:id` | Update user (role, active, full name) |
| POST | `/users/:id/reset-password` | Reset a user's password (forces change on next login) |

> New accounts are not created directly. An admin issues an **invitation**; the
> invitee accepts it via `POST /auth/register` (see below), which creates their
> account and signs them in.

### Invitations (Admin only)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/invitations` | Create an invitation (username + role); optionally emails a link |
| GET | `/invitations` | List invitations |
| DELETE | `/invitations/:id` | Revoke an unused invitation |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check |
| GET | `/health?deep=1` | Readiness check — also pings PostgreSQL (`503` if DB is down) |

---

## Frontend Integration

The React SPA in [`../admissions-app`](../admissions-app) is already wired to
this API. The client lives in
[`admissions-app/src/api.js`](../admissions-app/src/api.js) and handles auth,
CSRF, and the snake_case ↔ camelCase mapping between the DB rows and the UI
shape (`patientRowToAdmission` / `admissionToApiBody`).

Key points if you build your own client:

- **No JWT in JS storage.** Login sets an httpOnly `caretrack_session` cookie
  and a readable `caretrack_csrf` cookie. Send every request with
  `credentials: "include"`, and echo the CSRF cookie value back in the
  `X-CSRF-Token` header on all state-changing requests (POST/PATCH/DELETE).
- **API base.** Locally, Vite proxies `/api` to `http://localhost:3001`. For a
  standalone build, set `VITE_API_BASE` to the API origin (no trailing slash).
- **Session checks.** Call `GET /api/auth/me` on boot to determine whether the
  session cookie is still valid.

---

## HIPAA Compliance Checklist

### Implemented in this backend
- [x] All PHI access/modification events are audit-logged (who, what, when, from where)
- [x] Role-based access control enforced server-side (not just in the UI)
- [x] Physicians scoped to their own patients server-side
- [x] Passwords hashed with bcrypt (12 rounds minimum)
- [x] JWT sessions expire after 8 hours
- [x] Timing-safe login (prevents username enumeration)
- [x] Helmet.js security headers (HSTS, CSP, etc.)
- [x] Rate limiting on all endpoints, stricter on login
- [x] Request body size capped (512KB)
- [x] No PHI in server logs (Morgan configured for header-only logging in production)
- [x] SSL required for database connections
- [x] Soft-delete for discharged patients — records are retained (`discharged_at` set, filtered from all active queries), not hard-deleted, so PHI is preserved per HIPAA. A UI/endpoint to *view* discharged records is not yet built (see `PROD_READINESS.md`).
- [x] Audit logs shipped to Azure Blob Storage with immutability policy

### Required before production go-live
- [ ] Sign a Business Associate Agreement (BAA) with Microsoft Azure
- [ ] Sign a BAA with any other vendors (email, SMS notification providers, etc.)
- [ ] Enable Azure Defender for PostgreSQL
- [ ] Configure private VNet between App Service and PostgreSQL (no public DB endpoint)
- [ ] Enable Azure Private Endpoint for Blob Storage
- [ ] Set up Azure Monitor alerts for failed logins and unusual access patterns
- [ ] Enable App Service access restrictions (IP allowlist if applicable)
- [ ] Configure session timeout and re-authentication in the frontend
- [ ] Implement MFA for all user accounts
- [ ] Conduct a risk analysis (required by HIPAA Security Rule §164.308(a)(1))
- [ ] Document your policies and procedures
- [ ] Train all staff on HIPAA requirements
- [ ] Schedule annual HIPAA audits

---

## Security Notes

**The JWT lives in an httpOnly `caretrack_session` cookie** — never in
`localStorage`, `sessionStorage`, or JS-accessible memory, so it cannot be read
by XSS. State-changing requests are protected with a double-submit CSRF token
(`caretrack_csrf` cookie echoed back in the `X-CSRF-Token` header). In
production the cookies are `Secure`, and `SameSite=none` is required when the
SPA and API are on different sites. See `src/services/session.js`.

**Passwords must be at least 12 characters.** Enforce complexity requirements in your organization's password policy.

**Audit logs are immutable in Azure Blob Storage** with a 7-year retention policy, satisfying the HIPAA requirement to retain PHI-related documentation for 6 years.

**Never commit `.env` to source control.** All production secrets must be stored in Azure Key Vault and referenced via Managed Identity.
