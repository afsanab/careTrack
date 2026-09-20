# CareTrack Container Apps - Automated Deployment Script
# Cost-optimized HIPAA-compliant deployment (~$37/month)
#
# Prerequisites:
# - Azure CLI installed and logged in (az login)
# - Docker installed
# - PowerShell 7+
#
# Usage:
#   .\scripts\deploy-container-apps.ps1

param(
    [string]$ResourceGroup = "caretrack-rg",
    [string]$Location = "eastus",
    [string]$EnvironmentName = "caretrack-env",
    [string]$AppName = "caretrack-api",
    [string]$AcrName = "caretrackacr$(Get-Random -Minimum 1000 -Maximum 9999)",  # Must be globally unique
    [string]$DbServer = "caretrack-db",
    [string]$VaultName = "caretrack-kv$(Get-Random -Minimum 100 -Maximum 999)",  # Must be globally unique
    [string]$StorageAccount = "caretrackaudit$(Get-Random -Minimum 100 -Maximum 999)",  # Must be globally unique
    [string]$DbAdminUser = "caretrackadmin",
    [string]$DbAdminPassword = "",  # Will be generated if empty
    [string]$AdminUsername = "admin",
    [string]$AdminPassword = "",  # Will be prompted if empty
    [string]$AdminFullName = "System Administrator",
    [string]$AllowedOrigins = "http://localhost:5173",  # Update after deploying frontend
    [string]$AppPublicUrl = "http://localhost:5173"     # SPA base URL; API refuses to boot without it
)

# Color output functions
function Write-Success { Write-Host "[ok]   $args" -ForegroundColor Green }
function Write-Info { Write-Host "[info] $args" -ForegroundColor Cyan }
function Write-Warning { Write-Host "[warn] $args" -ForegroundColor Yellow }
function Write-Error { Write-Host "[fail] $args" -ForegroundColor Red }
function Write-Step { Write-Host "`n==== $args ====" -ForegroundColor Magenta }

# Check prerequisites
Write-Step "Checking Prerequisites"

if (!(Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error "Azure CLI not found. Install from: https://aka.ms/installazurecliwindows"
    exit 1
}

if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker not found. Install from: https://www.docker.com/products/docker-desktop"
    exit 1
}

if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js not found. Install from: https://nodejs.org/"
    exit 1
}

Write-Success "All prerequisites met"

# Check Azure login
Write-Info "Checking Azure login..."
$account = az account show 2>$null | ConvertFrom-Json
if (!$account) {
    Write-Error "Not logged in to Azure. Run 'az login' first."
    exit 1
}
Write-Success "Logged in as $($account.user.name)"

# Generate secure passwords if not provided
if ([string]::IsNullOrEmpty($DbAdminPassword)) {
    Write-Info "Generating secure database password..."
    $DbAdminPassword = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})
    $DbAdminPassword += "!A1"  # Ensure complexity requirements
}

if ([string]::IsNullOrEmpty($AdminPassword)) {
    $AdminPassword = Read-Host "Enter password for admin user '$AdminUsername' (min 12 chars)" -AsSecureString
    $AdminPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($AdminPassword))
    
    if ($AdminPassword.Length -lt 12) {
        Write-Error "Admin password must be at least 12 characters"
        exit 1
    }
}

# Generate JWT secret
Write-Info "Generating JWT secret..."
$JwtSecret = node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

Write-Step "Configuration Summary"
Write-Info "Resource Group:     $ResourceGroup"
Write-Info "Location:           $Location"
Write-Info "Container App:      $AppName"
Write-Info "ACR:                $AcrName"
Write-Info "Database:           $DbServer"
Write-Info "Key Vault:          $VaultName"
Write-Info "Storage Account:    $StorageAccount"
Write-Info ""
Write-Warning "Estimated cost: ~`$37/month"
Write-Info ""
$confirm = Read-Host "Proceed with deployment? (yes/no)"
if ($confirm -ne "yes") {
    Write-Info "Deployment cancelled"
    exit 0
}

# Create resource group
Write-Step "Step 1/14: Creating Resource Group"
az group create --name $ResourceGroup --location $Location --output none
Write-Success "Resource group created: $ResourceGroup"

# Create Container Registry
Write-Step "Step 2/14: Creating Azure Container Registry"
az acr create `
    --resource-group $ResourceGroup `
    --name $AcrName `
    --sku Basic `
    --admin-enabled true `
    --output none
Write-Success "Container Registry created: $AcrName"

$acrUsername = az acr credential show --name $AcrName --query username -o tsv
$acrPassword = az acr credential show --name $AcrName --query "passwords[0].value" -o tsv

# Build and push Docker image
Write-Step "Step 3/14: Building and Pushing Docker Image"
az acr login --name $AcrName
docker build -t "${AcrName}.azurecr.io/caretrack-api:latest" ./caretrack-backend
docker push "${AcrName}.azurecr.io/caretrack-api:latest"
Write-Success "Docker image pushed to ACR"

# Create PostgreSQL Database
Write-Step "Step 4/14: Creating PostgreSQL Database (B1ms - `$13/mo)"
az postgres flexible-server create `
    --resource-group $ResourceGroup `
    --name $DbServer `
    --location $Location `
    --admin-user $DbAdminUser `
    --admin-password $DbAdminPassword `
    --sku-name Standard_B1ms `
    --tier Burstable `
    --version 15 `
    --storage-size 32 `
    --backup-retention 35 `
    --public-access None `
    --output none

# Enable SSL
az postgres flexible-server parameter set `
    --resource-group $ResourceGroup `
    --server-name $DbServer `
    --name require_secure_transport `
    --value ON `
    --output none

Write-Success "PostgreSQL database created: $DbServer"

# Create Key Vault
Write-Step "Step 5/14: Creating Key Vault"
az keyvault create `
    --name $VaultName `
    --resource-group $ResourceGroup `
    --location $Location `
    --enable-rbac-authorization true `
    --enable-purge-protection true `
    --output none
Write-Success "Key Vault created: $VaultName"

# Store secrets in Key Vault
Write-Step "Step 6/14: Storing Secrets in Key Vault"
az keyvault secret set --vault-name $VaultName --name "JWT-SECRET" --value $JwtSecret --output none
az keyvault secret set --vault-name $VaultName --name "DB-PASSWORD" --value $DbAdminPassword --output none
Write-Success "Secrets stored in Key Vault"

# Create Blob Storage
Write-Step "Step 7/14: Creating Blob Storage for Audit Logs"
az storage account create `
    --name $StorageAccount `
    --resource-group $ResourceGroup `
    --location $Location `
    --sku Standard_GRS `
    --min-tls-version TLS1_2 `
    --allow-blob-public-access false `
    --output none

az storage container create `
    --name caretrack-audit-logs `
    --account-name $StorageAccount `
    --public-access off `
    --auth-mode login `
    --output none

$storageConn = az storage account show-connection-string `
    --name $StorageAccount `
    --resource-group $ResourceGroup `
    --query connectionString -o tsv

az keyvault secret set --vault-name $VaultName --name "STORAGE-CONN" --value $storageConn --output none
Write-Success "Blob Storage created: $StorageAccount"

# Create VNet
Write-Step "Step 8/14: Creating Virtual Network"
az network vnet create `
    --resource-group $ResourceGroup `
    --name caretrack-vnet `
    --address-prefix 10.0.0.0/16 `
    --subnet-name container-apps-subnet `
    --subnet-prefix 10.0.0.0/23 `
    --output none
Write-Success "VNet created: caretrack-vnet"

$subnetId = az network vnet subnet show `
    --resource-group $ResourceGroup `
    --vnet-name caretrack-vnet `
    --name container-apps-subnet `
    --query id -o tsv

# Create Container Apps Environment
Write-Step "Step 9/14: Creating Container Apps Environment"
az containerapp env create `
    --name $EnvironmentName `
    --resource-group $ResourceGroup `
    --location $Location `
    --infrastructure-subnet-resource-id $subnetId `
    --internal-only false `
    --output none
Write-Success "Container Apps Environment created: $EnvironmentName"

# Create Container App
Write-Step "Step 10/14: Creating Container App"
$dbHost = "${DbServer}.postgres.database.azure.com"
$databaseUrl = "postgresql://${DbAdminUser}:${DbAdminPassword}@${dbHost}:5432/postgres?sslmode=require"

az containerapp create `
    --name $AppName `
    --resource-group $ResourceGroup `
    --environment $EnvironmentName `
    --image "${AcrName}.azurecr.io/caretrack-api:latest" `
    --registry-server "${AcrName}.azurecr.io" `
    --registry-username $acrUsername `
    --registry-password $acrPassword `
    --target-port 8080 `
    --ingress external `
    --min-replicas 0 `
    --max-replicas 3 `
    --cpu 0.5 `
    --memory 1.0Gi `
    --env-vars "NODE_ENV=production" "PORT=8080" "DATABASE_URL=$databaseUrl" "JWT_SECRET=$JwtSecret" "ALLOWED_ORIGINS=$AllowedOrigins" "APP_PUBLIC_URL=$AppPublicUrl" "DB_SSL_STRICT=true" "COOKIE_SAMESITE=none" "AZURE_STORAGE_CONNECTION_STRING=$storageConn" "AZURE_AUDIT_CONTAINER=caretrack-audit-logs" `
    --output none

Write-Success "Container App created: $AppName"

# Enable Managed Identity
Write-Step "Step 11/14: Configuring Managed Identity"
az containerapp identity assign `
    --name $AppName `
    --resource-group $ResourceGroup `
    --system-assigned `
    --output none

$principalId = az containerapp identity show `
    --name $AppName `
    --resource-group $ResourceGroup `
    --query principalId -o tsv

$vaultId = az keyvault show --name $VaultName --resource-group $ResourceGroup --query id -o tsv

Start-Sleep -Seconds 10  # Wait for identity propagation

az role assignment create `
    --role "Key Vault Secrets User" `
    --assignee-object-id $principalId `
    --assignee-principal-type ServicePrincipal `
    --scope $vaultId `
    --output none

Write-Success "Managed Identity configured"

# Configure Private Endpoint for Database
Write-Step "Step 12/14: Configuring Private Database Access"
az network vnet subnet create `
    --resource-group $ResourceGroup `
    --vnet-name caretrack-vnet `
    --name database-subnet `
    --address-prefix 10.0.2.0/24 `
    --output none

$dbId = az postgres flexible-server show --resource-group $ResourceGroup --name $DbServer --query id -o tsv

az network private-endpoint create `
    --name caretrack-db-pe `
    --resource-group $ResourceGroup `
    --vnet-name caretrack-vnet `
    --subnet database-subnet `
    --private-connection-resource-id $dbId `
    --group-id postgresqlServer `
    --connection-name caretrack-db-connection `
    --output none

Write-Success "Private endpoint configured"

# Run Database Migrations
Write-Step "Step 13/14: Running Database Migrations"
Write-Info "Temporarily allowing your IP for migration..."

$myIp = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content

az postgres flexible-server firewall-rule create `
    --resource-group $ResourceGroup `
    --name $DbServer `
    --rule-name temp-migration `
    --start-ip-address $myIp `
    --end-ip-address $myIp `
    --output none

Start-Sleep -Seconds 5

Push-Location caretrack-backend
$env:DATABASE_URL = $databaseUrl
node migrations/run.js

if ($LASTEXITCODE -ne 0) {
    Write-Error "Migration failed!"
    Pop-Location
    exit 1
}

Write-Success "Database migrations completed"

# Create first admin user
Write-Info "Creating admin user..."
$env:ADMIN_USERNAME = $AdminUsername
$env:ADMIN_PASSWORD = $AdminPassword
$env:ADMIN_FULL_NAME = $AdminFullName
$env:JWT_SECRET = $JwtSecret
$env:ALLOWED_ORIGINS = $AllowedOrigins
npm run create-admin

if ($LASTEXITCODE -ne 0) {
    Write-Error "Admin user creation failed!"
    Pop-Location
    exit 1
}

Pop-Location
Write-Success "Admin user created: $AdminUsername"

# Remove temporary firewall rule
az postgres flexible-server firewall-rule delete `
    --resource-group $ResourceGroup `
    --name $DbServer `
    --rule-name temp-migration `
    --yes `
    --output none

# Get API URL
Write-Step "Step 14/14: Deployment Complete!"
$apiUrl = az containerapp show `
    --name $AppName `
    --resource-group $ResourceGroup `
    --query properties.configuration.ingress.fqdn -o tsv

Write-Success "Deployment successful!"
Write-Info ""
Write-Info "============================================"
Write-Info "       CareTrack Container Apps Deployed"
Write-Info "============================================"
Write-Info ""
Write-Info "API URL:          https://$apiUrl"
Write-Info "Health Check:     https://$apiUrl/api/health?deep=1"
Write-Info ""
Write-Info "Admin Login:"
Write-Info "  Username:       $AdminUsername"
Write-Info "  Password:       [saved - check your password manager]"
Write-Info ""
Write-Info "Azure Resources:"
Write-Info "  Resource Group: $ResourceGroup"
Write-Info "  Container App:  $AppName"
Write-Info "  Database:       $DbServer"
Write-Info "  Key Vault:      $VaultName"
Write-Info "  ACR:            $AcrName"
Write-Info ""
Write-Info "Estimated Monthly Cost: ~`$37"
Write-Info ""
Write-Info "Next Steps:"
Write-Info "1. Test API: curl https://$apiUrl/api/health?deep=1"
Write-Info "2. Deploy frontend with VITE_API_BASE=https://$apiUrl"
Write-Info "3. Update ALLOWED_ORIGINS and APP_PUBLIC_URL in Container App settings"
Write-Info "4. Review Azure Monitor for logs and metrics"
Write-Info ""
Write-Warning "SAVE THESE CREDENTIALS SECURELY:"
Write-Info "Database Password: $DbAdminPassword"
Write-Info "JWT Secret: [stored in Key Vault: $VaultName]"
Write-Info ""

# Test health endpoint
Write-Info "Testing health endpoint..."
Start-Sleep -Seconds 10  # Wait for container to be ready
$healthResponse = Invoke-WebRequest -Uri "https://$apiUrl/api/health?deep=1" -UseBasicParsing -ErrorAction SilentlyContinue

if ($healthResponse.StatusCode -eq 200) {
    Write-Success "Health check passed"
} else {
    Write-Warning "Health check pending... Container may still be starting up."
    Write-Info "Check logs: az containerapp logs show --name $AppName --resource-group $ResourceGroup --follow"
}

Write-Info ""
Write-Info "Deployment script completed successfully!"
