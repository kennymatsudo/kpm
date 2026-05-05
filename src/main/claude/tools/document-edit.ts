/**
 * Document Edit Tool
 *
 * Only the changed portion is sent as output tokens; the full new content is computed
 * server-side and emitted as a DocumentUpdatePayload (same shape as document-update.ts).
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError, toolLog } from './index';
import type { DocumentUpdateCallback } from './document-update';

export type ReadProjectFileFn = (projectId: string, filePath: string) => Promise<string | null>;


For new files use \`propose_document_create\`. For the project context file (AGENTS.md / CLAUDE.md) use \`propose_context_edit\`.

Rules:
- old_string must match exactly one location (whitespace + indentation included). If missing or non-unique, the call fails — add more surrounding context.
- old_string and new_string must differ.
- Treat \`@plan/<uuid>\` tokens as atomic; never split one across the boundary or partially overwrite the UUID. Use only UUIDs from the system prompt's Item Reference. Refs in prose render as live chips locally and rewrite to native tracker syntax on export.

/**
 * Create the document edit tool.
 *
 * @param readFile - Function to read a project file by projectId and relative path
 * @param onDocumentUpdate - Callback to emit proposed update to the UI for approval
 */
export function createDocumentEditTools(
  readFile: ReadProjectFileFn,
  onDocumentUpdate: DocumentUpdateCallback
) {
  console.log('[KPM Tools] Creating propose_document_edit tool');

  return [
    tool(
      'propose_document_edit',
      TOOL_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        filePath: z.string().min(1)
          .refine(
            (p) => !p.startsWith('/') && !/^[a-zA-Z]:/.test(p) && !p.includes('..'),
            'File path must be a relative path within the KPM project (e.g., "guide.md"). Do not use absolute paths from connected repositories or the local filesystem.'
          )
          .describe('Relative file path within the KPM project (e.g., "guide.md", "meeting-notes.md"). Must be relative — never an absolute path like /Users/... or a path into a connected repo.'),
      },

        let currentContent: string | null;
        try {
          currentContent = await readFile(projectId, filePath);
        } catch (error) {
          console.error(`[KPM Tools] Error reading file:`, error);
          return toolError(`Failed to read file "${filePath}": ${error instanceof Error ? error.message : String(error)}`);
        }

        if (currentContent === null) {
          return toolError(`File "${filePath}" not found. Use propose_document_create to create a new file.`);
        }





        try {
          onDocumentUpdate({ projectId, filePath, content: newContent, oldContent: currentContent });
        } catch (error) {
          console.error(`[KPM Tools] Error emitting document edit:`, error);
          return toolError(`Failed to propose document edit: ${error instanceof Error ? error.message : String(error)}`);
        }

        return jsonResult({
          success: true,
          filePath,
        });
      }
    ),
  ];
}
