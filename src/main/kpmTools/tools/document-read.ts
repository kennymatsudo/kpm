import { z } from 'zod';
import { createHash } from 'crypto';
import { tool, toolResult, toolError, toolLog, projectScoped } from './index';
import type { ReadProjectFileFn } from './document-edit';

const TOOL_DESCRIPTION = `Read a file from the KPM project folder: the notes, specs, and docs that belong to this project, not files in a connected code repo. Returns a header line with the path, a short hash, and the line count, then the file's text. Read a file before proposing an edit to it unless its current text is already in the conversation; pass the hash as propose_document_edit's expectedHash to catch changes made in between. To find which file to read, use list_project_files.`;

export function createDocumentReadTools(readFile: ReadProjectFileFn) {
  return [
    tool(
      'read_project_file',
      TOOL_DESCRIPTION,
      {
        filePath: z
          .string()
          .min(1)
          .refine(
            (p) => !p.startsWith('/') && !/^[a-zA-Z]:/.test(p) && !p.includes('..'),
            'Must be a relative path within the project'
          )
          .describe('Relative file path within the KPM project (e.g. "guide.md", "docs/spec.md")'),
      },
      projectScoped(async ({ projectId, filePath }) => {
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

        return toolResult(`path: ${filePath} | hash: ${hash} | lines: ${lines}\n\n${content}`);
      }),
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),
  ];
}
