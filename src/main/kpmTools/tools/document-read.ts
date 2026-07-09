import { z } from 'zod';
import { createHash } from 'crypto';
import { tool, jsonResult, toolError, toolLog } from './index';
import type { ReadProjectFileFn } from './document-edit';

const TOOL_DESCRIPTION = `Read a KPM project file. Returns content, a short hash, and line count. Call before propose_document_edit to confirm current content and obtain the hash for change detection.`;

export function createDocumentReadTools(readFile: ReadProjectFileFn) {
  return [
    tool(
      'read_project_file',
      TOOL_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        filePath: z
          .string()
          .min(1)
          .refine(
            (p) => !p.startsWith('/') && !/^[a-zA-Z]:/.test(p) && !p.includes('..'),
            'Must be a relative path within the project'
          )
          .describe('Relative file path within the KPM project (e.g. "guide.md", "docs/spec.md")'),
      },
      async ({ projectId, filePath }) => {
        toolLog(`[KPM Tools] read_project_file ${projectId} ${filePath}`);

        let content: string | null;
        try {
          content = await readFile(projectId, filePath);
        } catch (error) {
          return toolError(
            `Failed to read "${filePath}": ${error instanceof Error ? error.message : String(error)}`
          );
        }

        if (content === null) {
          return toolError(
            `File "${filePath}" not found. Use list_project_files to see available files.`
          );
        }

        const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
        const lines = content.split('\n').length;

        return jsonResult({ filePath, content, hash, lines });
      }
    ),
  ];
}
