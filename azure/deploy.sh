#!/usr/bin/env bash
# deploy.sh — Deploy google-drive-mcp to Azure Container Apps
# Usage: Set the required environment variables, then run:
#   chmod +x azure/deploy.sh && ./azure/deploy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Configuration (override via environment variables) ─────────────────────────
APP_NAME="${APP_NAME:-gdrive-mcp}"
LOCATION="${LOCATION:-canadaeast}"
RESOURCE_GROUP="${RESOURCE_GROUP:-${APP_NAME}-rg}"

# Required Google OAuth credentials
: "${GOOGLE_CLIENT_ID:?'GOOGLE_CLIENT_ID is required. Export it before running.'}"
: "${GOOGLE_CLIENT_SECRET:?'GOOGLE_CLIENT_SECRET is required. Export it before running.'}"
GOOGLE_REFRESH_TOKEN="${GOOGLE_REFRESH_TOKEN:-}"

# Derived names
ACR_NAME="${ACR_NAME:-$(echo "${APP_NAME}acr" | tr -d '-')}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_NAME="${ACR_NAME}.azurecr.io/${APP_NAME}:${IMAGE_TAG}"

echo "═══════════════════════════════════════════════════════"
echo " google-drive-mcp  →  Azure Container Apps"
echo "═══════════════════════════════════════════════════════"
echo " App name : ${APP_NAME}"
echo " Location : ${LOCATION}"
echo " ACR name : ${ACR_NAME}"
echo "═══════════════════════════════════════════════════════"

# ── Step 1: Provision infrastructure with Bicep ────────────────────────────────
echo ""
echo "▶ Step 1/4 — Provisioning Azure infrastructure..."

az deployment sub create \
  --name "${APP_NAME}-deployment" \
  --location "${LOCATION}" \
  --template-file "${SCRIPT_DIR}/main.bicep" \
  --parameters \
      appName="${APP_NAME}" \
      location="${LOCATION}" \
      googleClientId="${GOOGLE_CLIENT_ID}" \
      googleClientSecret="${GOOGLE_CLIENT_SECRET}" \
      googleRefreshToken="${GOOGLE_REFRESH_TOKEN}"

echo "✔ Infrastructure provisioned."

# ── Step 2: Build & push the Docker image to ACR ──────────────────────────────
echo ""
echo "▶ Step 2/4 — Building and pushing Docker image to ACR..."

az acr build \
  --registry "${ACR_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --image "${APP_NAME}:${IMAGE_TAG}" \
  "${REPO_ROOT}"

echo "✔ Image pushed: ${IMAGE_NAME}"

# ── Step 3: Update the Container App with the new image ───────────────────────
echo ""
echo "▶ Step 3/4 — Updating Container App with new image..."

az containerapp update \
  --name "${APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --image "${IMAGE_NAME}"

echo "✔ Container App updated."

# ── Step 4: Print the HTTPS URL ───────────────────────────────────────────────
echo ""
echo "▶ Step 4/4 — Retrieving endpoint URL..."

FQDN=$(az containerapp show \
  --name "${APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query "properties.configuration.ingress.fqdn" \
  --output tsv)

MCP_URL="https://${FQDN}/mcp"

echo ""
echo "═══════════════════════════════════════════════════════"
echo " ✅ Deployment complete!"
echo ""
echo " MCP endpoint : ${MCP_URL}"
echo ""
echo " Register in claude.ai:"
echo "   Settings → Customize → Connectors → Add custom connector"
echo "   URL: ${MCP_URL}"
echo "═══════════════════════════════════════════════════════"
