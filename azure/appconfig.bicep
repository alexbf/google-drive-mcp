// Standalone module: Azure App Configuration for persistent OAuth refresh token storage.
//
// Manual integration steps (if you have an existing azure/main.bicep or similar):
//   1. Deploy this module or copy the resources into your main template.
//   2. Pass the Container App managed identity principal ID as `containerAppPrincipalId`.
//   3. Set the AZURE_APP_CONFIG_ENDPOINT env var on the Container App to
//      appConfig.properties.endpoint (exposed as output `appConfigEndpoint` below).
//
// To deploy standalone:
//   az deployment group create \
//     --resource-group <rg> \
//     --template-file azure/appconfig.bicep \
//     --parameters containerAppPrincipalId=<principal-id>

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Object (principal) ID of the Container App managed identity')
param containerAppPrincipalId string

@description('Name for the App Configuration store')
param appConfigName string = 'gdrive-mcp-appconfig'

// ── App Configuration store (Free tier) ──────────────────────────────────────

resource appConfig 'Microsoft.AppConfiguration/configurationStores@2023-03-01' = {
  name: appConfigName
  location: location
  sku: {
    name: 'Free'
  }
  properties: {
    disableLocalAuth: true // Managed Identity only — no connection strings
  }
}

// ── Role assignment: App Configuration Data Reader ───────────────────────────
// Allows the Container App to read (but not write) configuration keys.
// Role definition ID for "App Configuration Data Reader":
//   https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles

var appConfigDataReaderRoleId = '516239f1-63e1-4d78-a4de-a74fb236a071'

resource appConfigReaderRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(appConfig.id, containerAppPrincipalId, appConfigDataReaderRoleId)
  scope: appConfig
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', appConfigDataReaderRoleId)
    principalId: containerAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// ── Role assignment: App Configuration Data Owner ────────────────────────────
// Allows the Container App to write (persist) the refresh token.
// Role definition ID for "App Configuration Data Owner":
//   https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles

var appConfigDataOwnerRoleId = '5ae67dd6-50cb-40e7-96ff-dc2bfa4b606b'

resource appConfigOwnerRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(appConfig.id, containerAppPrincipalId, appConfigDataOwnerRoleId)
  scope: appConfig
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', appConfigDataOwnerRoleId)
    principalId: containerAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

@description('App Configuration endpoint — set as AZURE_APP_CONFIG_ENDPOINT on the Container App')
output appConfigEndpoint string = appConfig.properties.endpoint
