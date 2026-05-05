/* eslint-disable @typescript-eslint/require-await */
/**
 * Document Update Tool
 *
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError, toolLog } from './index';

export interface DocumentUpdatePayload {
  projectId: string;
  chatSessionId?: string;
  filePath: string;
  content: string;
  /**
   * The file's content immediately before this proposal, captured by the tool
   * that produced the payload. `null` for `propose_document_create` (no prior
   * content). Avoids a second disk read in the subscriber for diff display.
   */
  oldContent: string | null;
}

export type DocumentUpdateCallback = (update: DocumentUpdatePayload) => void;



Cross-references: write \`@plan/<uuid>\` inline when mentioning plan items — KPM renders chips locally and rewrites to native tracker syntax on export. Use only UUIDs from the system prompt's Item Reference. Refs inside fenced code blocks won't resolve.

Multiple files: call ONE AT A TIME, never in parallel. Verify path matches content each call.`;

/**
 * Create the document create tool.
 *
 * @param onDocumentUpdate - Callback to emit proposed update to the UI for approval
 */
export function createDocumentCreateTools(onDocumentUpdate: DocumentUpdateCallback) {
  console.log('[KPM Tools] Creating propose_document_create tool');

  return [
    tool(
      'propose_document_create',
      TOOL_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        filePath: z.string().min(1)
        .refine(
          (p) => !p.startsWith('/') && !/^[a-zA-Z]:/.test(p) && !p.includes('..'),
          'File path must be a relative path within the KPM project (e.g., "guide.md"). Do not use absolute paths from connected repositories or the local filesystem.'
        )
        .describe('Relative file path within the KPM project (e.g., "guide.md", "meeting-notes.md"). Must be relative — never an absolute path like /Users/... or a path into a connected repo.'),
        content: z.string().min(1).describe('The complete new document content (not a diff). Must be valid Markdown.'),
      },
      async ({ projectId, filePath, content }) => {
        toolLog(`[KPM Tools] propose_document_create ${projectId} ${filePath} (${content.length} chars)`);

        try {
          // propose_document_create is for new files — no prior content
          onDocumentUpdate({ projectId, filePath, content, oldContent: null });
        } catch (error) {
          console.error(`[KPM Tools] Error emitting document create:`, error);
          return toolError(`Failed to propose document create: ${error instanceof Error ? error.message : String(error)}`);
        }

        const preview = /^#+ .+$/m.exec(content)?.[0] ?? content.slice(0, 100);
        return jsonResult({
          success: true,
          filePath,
          contentPreview: preview,
        });
      }
    ),
  ];
}
