import {z} from 'zod';
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {Config} from './types.js';
import {downloadFile, makeDriveApiCall, uploadFile} from '../utils/drive-api.js';
import {jsonResult} from '../utils/response.js';
import {strictSchemaWithAliases} from '../utils/schema.js';
import {assertTextFileSupported, formatDriveToolError} from '../utils/text-file-guards.js';

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
		async (input: z.infer<typeof inputSchema>) => {
			try {
				const {fileId, text} = input;
				const textToAppend = text as string;
				const metadataParams = new URLSearchParams();
				metadataParams.set('fields', 'id,name,mimeType');
				metadataParams.set('supportsAllDrives', 'true');

				const fileMetadata = fileMetadataSchema.parse(await makeDriveApiCall('GET', `/files/${fileId}?${metadataParams.toString()}`, config.token));
				assertTextFileSupported('drive_append_to_file', fileMetadata.mimeType);

				const {content} = await downloadFile(config.token, fileId);
				const separator: '' | '\n' = content.length === 0 || content.endsWith('\n') ? '' : '\n';
				const updatedContent = `${content}${separator}${textToAppend}`;
				const appendedCharacters = textToAppend.length + separator.length;

				await uploadFile(config.token, {mimeType: fileMetadata.mimeType}, updatedContent, fileMetadata.mimeType, fileId);

				return jsonResult(outputSchema.parse({
					fileId: fileMetadata.id,
					name: fileMetadata.name,
					appendedCharacters,
					message: 'Text appended successfully',
				}));
			} catch (error) {
				throw new Error(formatDriveToolError('drive_append_to_file', error));
			}
		},
	);
}
