# Deploying CareTrack to Azure

Command-line deployment of the CareTrack API to **Azure Container Apps** and the SPA to
**Azure Static Web Apps**. HIPAA-capable: private database, SSL enforced, secrets in Key
Vault, immutable audit logs.

**Cost:** ~$37/month. **Time:** ~30 min.

```
Static Web Apps (SPA, free)
        │ HTTPS
        ▼
Container App (caretrack-api)  ──┬── PostgreSQL Flexible Server B1ms (private)   $13
  0.5 vCPU / 1 GB, scale 0–3     ├── Key Vault (secrets)                          $1
  $15-20                         ├── Blob Storage GRS (audit logs)                $3
                                 └── Container Registry Basic                     $5
```

Container Apps scales to zero when idle, which is where most of the savings come from;
the trade-off is a 2-3s cold start on the first request. Set `--min-replicas 1` to remove
it (+$10-15/month). App Service Standard S1 is the always-warm alternative at ~$91/month —
the same Docker image runs on it unchanged.

---

## Prerequisites

```powershell
az login                 # Azure CLI: https://aka.ms/installazurecliwindows
docker --version         # Docker Desktop
node --version           # 20.19+
$PSVersionTable.PSVersion  # PowerShell 7+
```

---

## Option A — automated script (no existing Azure resources)

Creates everything from scratch, runs migrations, creates the first admin, and health-checks
the result.

```powershell
cd c:\Users\Afsana\Desktop\SoftwareEngineeringProjects\careTrack
.\scripts\deploy-container-apps.ps1
```

It prompts for the admin password and prints the API URL plus the generated database
password at the end — **save that password to your password manager immediately**, it is
not stored anywhere else.

Override defaults with parameters, e.g. `-ResourceGroup my-rg -Location westus2`.

If you already have a database or Key Vault, the script's `create` calls will fail on those
resources. Use Option B and skip the steps you don't need.

---

## Option B — manual steps

Every step is marked **[skip if you already have it]** where applicable.

### 1. Variables

```powershell
$RG         = "caretrack-rg"
$LOCATION   = "eastus"          # same region as your database
$ENV_NAME   = "caretrack-env"
$APP_NAME   = "caretrack-api"
$VNET_NAME  = "caretrack-vnet"
$DB_SERVER  = "caretrack-db"
# The next three must be globally unique, lowercase, no hyphens:
$ACR_NAME   = "caretrackacr$(Get-Random -Min 1000 -Max 9999)"
$VAULT_NAME = "caretrackkv$(Get-Random -Min 100 -Max 999)"
$STORAGE    = "caretrackaudit$(Get-Random -Min 100 -Max 999)"

az group create --name $RG --location $LOCATION
```

### 2. Container Registry

```powershell
az acr create --resource-group $RG --name $ACR_NAME --sku Basic --admin-enabled true

$ACR_USER = az acr credential show --name $ACR_NAME --query username -o tsv
$ACR_PASS = az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv
```

### 3. Build and push the image

```powershell
az acr login --name $ACR_NAME
docker build -t "${ACR_NAME}.azurecr.io/caretrack-api:latest" ./caretrack-backend
docker push "${ACR_NAME}.azurecr.io/caretrack-api:latest"
```

### 4. PostgreSQL — [skip if you already have it]

```powershell
az postgres flexible-server create `
  --resource-group $RG --name $DB_SERVER --location $LOCATION `
  --admin-user caretrackadmin --admin-password "<strong-password>" `
  --sku-name Standard_B1ms --tier Burstable --version 15 `
  --storage-size 32 --backup-retention 35 --public-access None

az postgres flexible-server parameter set `
  --resource-group $RG --server-name $DB_SERVER `
  --name require_secure_transport --value ON
```

### 5. Key Vault and secrets — [skip the create if you already have a vault]

```powershell
az keyvault create --name $VAULT_NAME --resource-group $RG --location $LOCATION `
  --enable-rbac-authorization true --enable-purge-protection true

$JWT_SECRET = node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
$DB_URL = "postgresql://caretrackadmin:<password>@${DB_SERVER}.postgres.database.azure.com:5432/postgres?sslmode=require"

az keyvault secret set --vault-name $VAULT_NAME --name "JWT-SECRET"   --value $JWT_SECRET
az keyvault secret set --vault-name $VAULT_NAME --name "DATABASE-URL" --value $DB_URL
```

Already have a vault? Read the existing values out instead:

```powershell
$JWT_SECRET = az keyvault secret show --vault-name $VAULT_NAME --name "JWT-SECRET"   --query value -o tsv
$DB_URL     = az keyvault secret show --vault-name $VAULT_NAME --name "DATABASE-URL" --query value -o tsv
```

### 6. Blob Storage for audit logs — [skip if you already have it]

```powershell
az storage account create --name $STORAGE --resource-group $RG --location $LOCATION `
  --sku Standard_GRS --min-tls-version TLS1_2 --allow-blob-public-access false

az storage container create --name caretrack-audit-logs `
  --account-name $STORAGE --public-access off --auth-mode login

$STORAGE_CONN = az storage account show-connection-string `
  --name $STORAGE --resource-group $RG --query connectionString -o tsv

az keyvault secret set --vault-name $VAULT_NAME --name "STORAGE-CONN" --value $STORAGE_CONN
```

HIPAA requires tamper-proof audit logs. Apply a 7-year immutability policy:

```powershell
az storage container immutability-policy create `
  --account-name $STORAGE --container-name caretrack-audit-logs --period 2557
```

### 7. VNet and Container Apps environment

```powershell
az network vnet create --resource-group $RG --name $VNET_NAME `
  --address-prefix 10.0.0.0/16 `
  --subnet-name container-apps-subnet --subnet-prefix 10.0.0.0/23

$SUBNET_ID = az network vnet subnet show --resource-group $RG `
  --vnet-name $VNET_NAME --name container-apps-subnet --query id -o tsv

az containerapp env create --name $ENV_NAME --resource-group $RG --location $LOCATION `
  --infrastructure-subnet-resource-id $SUBNET_ID --internal-only false
```

### 8. Deploy the Container App

`APP_PUBLIC_URL` and `ALLOWED_ORIGINS` are placeholders until the frontend exists; step 12
updates them. Both must be set now — the API refuses to boot in production without
`APP_PUBLIC_URL`.

```powershell
$FRONTEND_URL = "http://localhost:5173"   # temporary

az containerapp create `
  --name $APP_NAME --resource-group $RG --environment $ENV_NAME `
  --image "${ACR_NAME}.azurecr.io/caretrack-api:latest" `
  --registry-server "${ACR_NAME}.azurecr.io" `
  --registry-username $ACR_USER --registry-password $ACR_PASS `
  --target-port 8080 --ingress external `
  --min-replicas 0 --max-replicas 3 --cpu 0.5 --memory 1.0Gi `
  --env-vars `
    "NODE_ENV=production" "PORT=8080" `
    "DATABASE_URL=$DB_URL" "JWT_SECRET=$JWT_SECRET" `
    "ALLOWED_ORIGINS=$FRONTEND_URL" "APP_PUBLIC_URL=$FRONTEND_URL" `
    "DB_SSL_STRICT=true" "COOKIE_SAMESITE=none" `
    "AZURE_STORAGE_CONNECTION_STRING=$STORAGE_CONN" `
    "AZURE_AUDIT_CONTAINER=caretrack-audit-logs"
```

### 9. Managed identity for Key Vault

```powershell
az containerapp identity assign --name $APP_NAME --resource-group $RG --system-assigned
Start-Sleep -Seconds 10   # identity propagation

$PRINCIPAL_ID = az containerapp identity show --name $APP_NAME --resource-group $RG --query principalId -o tsv
$VAULT_ID     = az keyvault show --name $VAULT_NAME --resource-group $RG --query id -o tsv

az role assignment create --role "Key Vault Secrets User" `
  --assignee-object-id $PRINCIPAL_ID --assignee-principal-type ServicePrincipal `
  --scope $VAULT_ID
```

RBAC takes 1-5 minutes to propagate.

### 10. Private database access

```powershell
az network vnet subnet create --resource-group $RG --vnet-name $VNET_NAME `
  --name database-subnet --address-prefix 10.0.2.0/24

$DB_ID = az postgres flexible-server show --resource-group $RG --name $DB_SERVER --query id -o tsv

az network private-endpoint create --name caretrack-db-pe --resource-group $RG `
  --vnet-name $VNET_NAME --subnet database-subnet `
  --private-connection-resource-id $DB_ID --group-id postgresqlServer `
  --connection-name caretrack-db-connection
```

### 11. Migrations and first admin

The database has no public endpoint, so open your IP just long enough to run these.

```powershell
$MY_IP = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content

az postgres flexible-server firewall-rule create `
  --resource-group $RG --name $DB_SERVER --rule-name temp-migration `
  --start-ip-address $MY_IP --end-ip-address $MY_IP

Push-Location caretrack-backend
$env:DATABASE_URL = $DB_URL
node migrations/run.js

$env:JWT_SECRET      = $JWT_SECRET
$env:ALLOWED_ORIGINS = $FRONTEND_URL
$env:ADMIN_USERNAME  = "admin"
$env:ADMIN_PASSWORD  = Read-Host "Admin password (min 12 chars)"
$env:ADMIN_FULL_NAME = "System Administrator"
npm run create-admin
Pop-Location

az postgres flexible-server firewall-rule delete `
  --resource-group $RG --name $DB_SERVER --rule-name temp-migration --yes
```

`npm run seed` is dev-only and must never run against production. `create-admin` refuses to
overwrite an existing username; use the in-app admin password reset instead.

### 12. Frontend, then point everything at it

```powershell
$API_URL = az containerapp show --name $APP_NAME --resource-group $RG `
  --query properties.configuration.ingress.fqdn -o tsv

Push-Location admissions-app
"VITE_API_BASE=https://$API_URL" | Out-File -FilePath .env.production -Encoding utf8
npm run build
az staticwebapp create --name caretrack-frontend --resource-group $RG `
  --source ./dist --location $LOCATION --sku Free
Pop-Location
```

Then update the API with the real frontend origin:

```powershell
az containerapp update --name $APP_NAME --resource-group $RG `
  --set-env-vars "ALLOWED_ORIGINS=https://<your-app>.azurestaticapps.net" `
                 "APP_PUBLIC_URL=https://<your-app>.azurestaticapps.net"
```

### 13. Verify

```powershell
curl "https://$API_URL/api/health?deep=1"
# {"status":"ok","db":"ok","timestamp":"..."}
```

Then log in through the SPA, create a patient, assign a task, and confirm entries land in
the `caretrack-audit-logs` blob container.

---

## Environment variables

Set on the Container App. Required ones are enforced at boot by
`caretrack-backend/src/config.js` — a bad value exits the process rather than starting in a
broken state.

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `PORT` | yes | `8080` (must match `--target-port`) |
| `DATABASE_URL` | yes* | Must contain `sslmode=require` in production |
| `JWT_SECRET` | yes | **≥64 chars in production**; 64-byte hex |
| `ALLOWED_ORIGINS` | yes | Comma-separated SPA origins, production URL only |
| `APP_PUBLIC_URL` | yes | SPA base URL. **Production boot fails without it** |
| `DB_SSL_STRICT` | yes | `true` |
| `COOKIE_SAMESITE` | yes | `none` when SPA and API are on different domains |
| `AZURE_STORAGE_CONNECTION_STRING` | optional | Enables audit-log shipping to Blob |
| `AZURE_AUDIT_CONTAINER` | optional | Defaults to `caretrack-audit-logs` |
| `RESEND_API_KEY` / `EMAIL_FROM` | optional | Invitation emails |
| `JWT_EXPIRES_IN` | optional | Defaults to `8h` |

\* Or all of `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` with `DB_SSL=true`.

Frontend builds only ever take public `VITE_*` values. Never put a JWT secret or database
string in Static Web Apps config.

---

## Shipping a new version

```powershell
az acr login --name $ACR_NAME
docker build -t "${ACR_NAME}.azurecr.io/caretrack-api:latest" ./caretrack-backend
docker push "${ACR_NAME}.azurecr.io/caretrack-api:latest"

az containerapp update --name $APP_NAME --resource-group $RG `
  --image "${ACR_NAME}.azurecr.io/caretrack-api:latest"
```

Container Apps keeps the old revision serving until the new one is healthy, so this is
zero-downtime. New migrations run the same way as step 11.

### CI/CD

`.github/workflows/deploy-containerapp.yml` does build-push-deploy-healthcheck on manual
trigger. It does **not** run migrations. To enable it, add in GitHub under
Settings → Secrets and variables → Actions:

- Secrets: `AZURE_CREDENTIALS` (service principal JSON), `ACR_USERNAME`, `ACR_PASSWORD`
- Variables: `AZURE_RESOURCE_GROUP`, `AZURE_CONTAINER_APP_NAME`, `ACR_LOGIN_SERVER`, `ACR_REPOSITORY`

Uncomment the `push` trigger once you trust it.

---

## Secret rotation

`az keyvault secret set` with the same `--name` creates a new version. After rotating,
restart the app so every replica picks it up:

```powershell
az keyvault secret set --vault-name $VAULT_NAME --name "JWT-SECRET" --value "<new>"
az containerapp revision restart --name $APP_NAME --resource-group $RG
```

Rotating `JWT_SECRET` invalidates all sessions — everyone re-logs in once. If the database
password changes, update the whole `DATABASE_URL` secret, not just the password fragment.
Revoke the old credential at the vendor once traffic is stable.

---

## Troubleshooting

```powershell
az containerapp logs show --name $APP_NAME --resource-group $RG --follow
az containerapp replica list --name $APP_NAME --resource-group $RG
az containerapp revision restart --name $APP_NAME --resource-group $RG
```

Zero replicas when idle is expected, not a fault.

| Symptom | Cause |
|---|---|
| `FATAL: invalid environment configuration` | Missing or malformed env var; the log names it |
| `FATAL: APP_PUBLIC_URL is required in production` | Set `APP_PUBLIC_URL` to the SPA URL |
| `JWT_SECRET must be at least 64 chars` | Regenerate with `randomBytes(64)` |
| `production DB connection must use SSL` | Add `?sslmode=require` to `DATABASE_URL` |
| Health check 503 | DB unreachable — check the private endpoint and VNet |
| CORS or cookie failures in the browser | `ALLOWED_ORIGINS`, `APP_PUBLIC_URL`, and `VITE_API_BASE` disagree; `COOKIE_SAMESITE` must be `none` cross-domain |
| Slow first request | Cold start from zero replicas; `--min-replicas 1` to avoid |

---

## Before real patient data

Infrastructure alone is not compliance. A signed BAA with Microsoft, a documented risk
analysis, MFA, monitoring alerts, and workforce training are all still required — tracked in
[`PROD_READINESS.md`](../PROD_READINESS.md).

- [Azure Container Apps](https://learn.microsoft.com/azure/container-apps/)
- [HIPAA on Azure](https://learn.microsoft.com/azure/compliance/offerings/offering-hipaa-us)
