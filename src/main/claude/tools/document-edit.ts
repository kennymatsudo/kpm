/**
 * Document Edit Tool
 *
 * Only the changed portion is sent as output tokens; the full new content is computed
 * server-side and emitted as a DocumentUpdatePayload (same shape as document-update.ts).
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';
import type { DocumentUpdateCallback } from './document-update';

export type ReadProjectFileFn = (projectId: string, filePath: string) => Promise<string | null>;




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

  return [
    tool(
      'propose_document_edit',
      TOOL_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        filePath: z.string().min(1)
          .refine(
            (p) => !p.startsWith('/') && !/^[a-zA-Z]:/.test(p) && !p.includes('..'),
          )
      },

        let currentContent: string | null;
        try {
          currentContent = await readFile(projectId, filePath);
        } catch (error) {
          return toolError(`Failed to read file "${filePath}": ${error instanceof Error ? error.message : String(error)}`);
        }

        if (currentContent === null) {
          return toolError(`File "${filePath}" not found. Use propose_document_create to create a new file.`);
        }





        try {
        } catch (error) {
          return toolError(`Failed to propose document edit: ${error instanceof Error ? error.message : String(error)}`);
        }

          success: true,
          filePath,
      }
    ),
  ];
}
