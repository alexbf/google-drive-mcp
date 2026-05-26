export function assertTextFileSupported(toolName: string, fileMimeType: string): void {
	if (fileMimeType.startsWith('application/vnd.google-apps.')) {
		throw new Error(`${toolName} only supports non-Google-native text files. Google Workspace files (application/vnd.google-apps.*) are not supported.`);
	}

	if (!fileMimeType.startsWith('text/')) {
		throw new Error(`${toolName} only supports text/* files. Current file mimeType is "${fileMimeType}".`);
	}
}

export function assertRequestedTextMimeType(toolName: string, requestedMimeType: string): void {
	if (!requestedMimeType.startsWith('text/')) {
		throw new Error(`${toolName} only supports text/* uploads. Requested mimeType is "${requestedMimeType}".`);
	}
}

export function formatDriveToolError(toolName: string, error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);

	if (message.includes('404')) {
		return `${toolName} failed: file not found or inaccessible.`;
	}

	if (message.includes('403')) {
		return `${toolName} failed: permission denied.`;
	}

	if (message.includes('401')) {
		return `${toolName} failed: unauthorized or expired token.`;
	}

	return `${toolName} failed: ${message}`;
}
