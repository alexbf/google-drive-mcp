using './main.bicep'

param appName = 'gdrive-mcp'
param location = 'canadaeast'

// Required — fill in your Google OAuth credentials before deploying
param googleClientId = '<YOUR_GOOGLE_CLIENT_ID>'
param googleClientSecret = '<YOUR_GOOGLE_CLIENT_SECRET>'

// Optional — leave empty or set if you have an existing refresh token
param googleRefreshToken = ''
