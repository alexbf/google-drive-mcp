import {AppConfigurationClient} from '@azure/app-configuration';
import {DefaultAzureCredential} from '@azure/identity';

const TOKEN_KEY = 'gdrive-mcp/refresh-token';

// Cache credential and client at module level to avoid redundant auth flows
let _client: AppConfigurationClient | null | undefined;

function getClient(): AppConfigurationClient | null {
	if (_client !== undefined) {
		return _client;
	}

	const endpoint = process.env.AZURE_APP_CONFIG_ENDPOINT;
	if (!endpoint) {
		_client = null;
		return null;
	}

	_client = new AppConfigurationClient(endpoint, new DefaultAzureCredential());
	return _client;
}

export async function loadRefreshToken(): Promise<string | null> {
	const client = getClient();
	if (!client) {
		console.error('google-drive-mcp: AZURE_APP_CONFIG_ENDPOINT not set — skipping refresh token load');
		return null;
	}

	try {
		const setting = await client.getConfigurationSetting({key: TOKEN_KEY});
		const token = setting.value ?? null;
		if (token) {
			console.error('google-drive-mcp: refresh token loaded from Azure App Configuration');
		}

		return token;
	} catch (error: unknown) {
		// Key not found is expected on first run
		if (isNotFoundError(error)) {
			return null;
		}

		console.error('google-drive-mcp: failed to load refresh token from Azure App Configuration:', error);
		return null;
	}
}

export async function saveRefreshToken(token: string): Promise<void> {
	const client = getClient();
	if (!client) {
		console.error('google-drive-mcp: AZURE_APP_CONFIG_ENDPOINT not set — skipping refresh token save');
		return;
	}

	try {
		await client.setConfigurationSetting({key: TOKEN_KEY, value: token});
		console.error('google-drive-mcp: refresh token saved to Azure App Configuration');
	} catch (error) {
		console.error('google-drive-mcp: failed to save refresh token to Azure App Configuration:', error);
	}
}

function isNotFoundError(error: unknown): boolean {
	if (typeof error === 'object' && error !== null) {
		const code = (error as {statusCode?: number; status?: number}).statusCode
			?? (error as {statusCode?: number; status?: number}).status;
		return code === 404;
	}

	return false;
}
