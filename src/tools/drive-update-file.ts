import {z} from 'zod';
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {Config} from './types.js';
import {makeDriveApiCall, uploadFile} from '../utils/drive-api.js';
import {jsonResult} from '../utils/response.js';
import {strictSchemaWithAliases} from '../utils/schema.js';
import {
	assertRequestedTextMimeType,
	assertTextFileSupported,
	formatDriveToolError,
} from '../utils/text-file-guards.js';

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
		async (input: z.infer<typeof inputSchema>) => {
			try {
				const {fileId, content, mimeType} = input;
				const metadataParams = new URLSearchParams();
				metadataParams.set('fields', 'id,name,mimeType');
				metadataParams.set('supportsAllDrives', 'true');

				const fileMetadata = fileMetadataSchema.parse(await makeDriveApiCall('GET', `/files/${fileId}?${metadataParams.toString()}`, config.token));
				assertTextFileSupported('drive_update_file', fileMetadata.mimeType);
				assertRequestedTextMimeType('drive_update_file', mimeType);

				await uploadFile(config.token, {mimeType}, content, mimeType, fileId);

				return jsonResult(outputSchema.parse({
					fileId: fileMetadata.id,
					name: fileMetadata.name,
					mimeType,
					message: 'File content updated successfully',
				}));
			} catch (error) {
				throw new Error(formatDriveToolError('drive_update_file', error));
			}
		},
	);
}
