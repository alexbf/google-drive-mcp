import {z} from 'zod';
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {Config} from './types.js';
import {downloadFile, makeDriveApiCall, uploadFile} from '../utils/drive-api.js';
import {jsonResult} from '../utils/response.js';
import {strictSchemaWithAliases} from '../utils/schema.js';

const inputSchema = strictSchemaWithAliases(
	{
		fileId: z.string().describe('The ID of the file to append text to'),
		text: z.string().describe('Text to append as a new line'),
	},
	{},
);

const outputSchema = z.object({
	fileId: z.string(),
	name: z.string(),
	appendedCharacters: z.number(),
	message: z.string(),
});

const fileMetadataSchema = z.object({
	id: z.string(),
	name: z.string(),
	mimeType: z.string(),
});

function guardTextFile(toolName: string, fileMimeType: string): void {
	if (fileMimeType.startsWith('application/vnd.google-apps.')) {
		throw new Error(`${toolName} only supports non-Google-native text files. Google Workspace files (application/vnd.google-apps.*) are not supported.`);
	}

	if (!fileMimeType.startsWith('text/')) {
		throw new Error(`${toolName} only supports text/* files. Current file mimeType is "${fileMimeType}".`);
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

export function registerDriveAppendToFile(server: McpServer, config: Config): void {
	server.registerTool(
		'drive_append_to_file',
		{
			title: 'Append text to file',
			description: 'Append text to an existing plain text or Markdown file on a new line. Only text/* files are supported.',
			inputSchema,
			outputSchema,
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
			},
		},
		async ({fileId, text}) => {
			try {
				const metadataParams = new URLSearchParams();
				metadataParams.set('fields', 'id,name,mimeType');
				metadataParams.set('supportsAllDrives', 'true');

				const fileMetadata = fileMetadataSchema.parse(await makeDriveApiCall('GET', `/files/${fileId}?${metadataParams.toString()}`, config.token));
				guardTextFile('drive_append_to_file', fileMetadata.mimeType);

				const {content} = await downloadFile(config.token, fileId);
				const separator = content.length === 0 || content.endsWith('\n') ? '' : '\n';
				const updatedContent = `${content}${separator}${text}`;

				await uploadFile(config.token, {mimeType: fileMetadata.mimeType}, updatedContent, fileMetadata.mimeType, fileId);

				return jsonResult(outputSchema.parse({
					fileId: fileMetadata.id,
					name: fileMetadata.name,
					appendedCharacters: text.length,
					message: 'Text appended successfully',
				}));
			} catch (error) {
				throw new Error(formatDriveError('drive_append_to_file', error));
			}
		},
	);
}
