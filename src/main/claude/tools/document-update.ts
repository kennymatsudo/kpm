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
 *
 * @param onDocumentUpdate - Callback to emit proposed update to the UI for approval
 */

  return [
    tool(
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
        }

        const preview = /^#+ .+$/m.exec(content)?.[0] ?? content.slice(0, 100);
          success: true,
          filePath,
          contentPreview: preview,
      }
    ),
  ];
}
