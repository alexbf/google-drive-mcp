targetScope = 'subscription'

@description('Base name for all resources')
param appName string = 'gdrive-mcp'

@description('Azure region for all resources')
param location string = 'canadaeast'

@description('Google OAuth Client ID')
@secure()
param googleClientId string

@description('Google OAuth Client Secret')
@secure()
param googleClientSecret string

@description('Google Refresh Token (optional, for future token persistence)')
@secure()
param googleRefreshToken string = ''

// Derive ACR name: must be alphanumeric only, 5-50 chars
var acrName = replace('${appName}acr', '-', '')

// ── Resource Group ─────────────────────────────────────────────────────────────
resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: '${appName}-rg'
  location: location
}

// ── Log Analytics Workspace ────────────────────────────────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${appName}-logs'
  location: location
  scope: rg
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ── Container App Environment ──────────────────────────────────────────────────
resource containerAppEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${appName}-env'
  location: location
  scope: rg
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ── Azure Container Registry (Basic SKU) ───────────────────────────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  scope: rg
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

// ── Container App ──────────────────────────────────────────────────────────────
resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  scope: rg
  properties: {
    environmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        allowInsecure: false
        transport: 'http'
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
        {
          name: 'google-client-id'
          value: googleClientId
        }
        {
          name: 'google-client-secret'
          value: googleClientSecret
        }
        {
          name: 'google-refresh-token'
          value: googleRefreshToken
        }
      ]
    }
    template: {
      containers: [
        {
          name: appName
          // Placeholder image — deploy.sh updates this after az acr build
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'MCP_TRANSPORT'
              value: 'http'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'GOOGLE_CLIENT_ID'
              secretRef: 'google-client-id'
            }
            {
              name: 'GOOGLE_CLIENT_SECRET'
              secretRef: 'google-client-secret'
            }
            {
              name: 'GOOGLE_REFRESH_TOKEN'
              secretRef: 'google-refresh-token'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

// ── Outputs ────────────────────────────────────────────────────────────────────
@description('FQDN of the deployed Container App')
output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn

@description('Full HTTPS URL of the MCP endpoint')
output mcpUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}/mcp'

@description('ACR login server')
output acrLoginServer string = acr.properties.loginServer
