import {z} from 'zod';
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {Config} from './types.js';
import {makeDriveApiCall, uploadFile} from '../utils/drive-api.js';
import {jsonResult} from '../utils/response.js';
import {strictSchemaWithAliases} from '../utils/schema.js';

const inputSchema = strictSchemaWithAliases(
	{
		fileId: z.string().describe('The ID of the file to update'),
		content: z.string().describe('The full replacement content for the file'),
		mimeType: z.string().default('text/plain').describe('MIME type for updated content (must be text/*). Defaults to text/plain.'),
	},
	{},
);

const outputSchema = z.object({
	fileId: z.string(),
	name: z.string(),
	mimeType: z.string(),
	message: z.string(),
});

const fileMetadataSchema = z.object({
	id: z.string(),
	name: z.string(),
	mimeType: z.string(),
});

function guardTextFile(toolName: string, fileMimeType: string, requestedMimeType: string): void {
	if (fileMimeType.startsWith('application/vnd.google-apps.')) {
		throw new Error(`${toolName} only supports non-Google-native text files. Google Workspace files (application/vnd.google-apps.*) are not supported.`);
	}

	if (!fileMimeType.startsWith('text/')) {
		throw new Error(`${toolName} only supports text/* files. Current file mimeType is "${fileMimeType}".`);
	}

	if (!requestedMimeType.startsWith('text/')) {
		throw new Error(`${toolName} only supports text/* uploads. Requested mimeType is "${requestedMimeType}".`);
	}
}

function formatDriveError(toolName: string, error: unknown): string {
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

export function registerDriveUpdateFile(server: McpServer, config: Config): void {
	server.registerTool(
		'drive_update_file',
		{
			title: 'Update text file content',
			description: 'Replace the full content of an existing plain text or Markdown file. Only text/* files are supported.',
			inputSchema,
			outputSchema,
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: true,
			},
		},
		async ({fileId, content, mimeType}) => {
			try {
				const metadataParams = new URLSearchParams();
				metadataParams.set('fields', 'id,name,mimeType');
				metadataParams.set('supportsAllDrives', 'true');

				const fileMetadata = fileMetadataSchema.parse(await makeDriveApiCall('GET', `/files/${fileId}?${metadataParams.toString()}`, config.token));
				guardTextFile('drive_update_file', fileMetadata.mimeType, mimeType);

				await uploadFile(config.token, {mimeType}, content, mimeType, fileId);

				return jsonResult(outputSchema.parse({
					fileId: fileMetadata.id,
					name: fileMetadata.name,
					mimeType,
					message: 'File content updated successfully',
				}));
			} catch (error) {
				throw new Error(formatDriveError('drive_update_file', error));
			}
		},
	);
}
