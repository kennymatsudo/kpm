/* eslint-disable @typescript-eslint/require-await */
/**
 * Document Update Tool
 *
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';

export interface DocumentUpdatePayload {
  projectId: string;
  chatSessionId?: string;
  filePath: string;
  content: string;
}

export type DocumentUpdateCallback = (update: DocumentUpdatePayload) => void;





/**
 * Create the document create tool.
 *
 * @param onDocumentUpdate - Callback to emit proposed update to the UI for approval
 */
export function createDocumentCreateTools(onDocumentUpdate: DocumentUpdateCallback) {

  return [
    tool(
      'propose_document_create',
      TOOL_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        filePath: z.string().min(1)
        .refine(
          (p) => !p.startsWith('/') && !/^[a-zA-Z]:/.test(p) && !p.includes('..'),
        )
        content: z.string().min(1).describe('The complete new document content (not a diff). Must be valid Markdown.'),
      },
      async ({ projectId, filePath, content }) => {

        try {
        } catch (error) {
          return toolError(`Failed to propose document create: ${error instanceof Error ? error.message : String(error)}`);
        }

        const preview = /^#+ .+$/m.exec(content)?.[0] ?? content.slice(0, 100);
          success: true,
          filePath,
          contentPreview: preview,
      }
    ),
  ];
}
