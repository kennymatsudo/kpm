/* eslint-disable @typescript-eslint/require-await */
/**
 * Document Update Tool
 *
 * Allows Claude to submit updates to project files (docs, notes, specs, etc.).
 * KPM either queues them for review or applies them immediately based on the
 * user's approval setting.
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError, toolLog, projectScoped } from './index';

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

const TOOL_DESCRIPTION = `Propose a new file in the KPM project folder, or a full replacement of an existing one, with its complete content. KPM queues it for review or applies it, per the user's setting. For a change to part of a file, use propose_document_edit, which sends only the changed text. For the project context file (AGENTS.md or CLAUDE.md), use propose_context_edit. When asked to write something "using X as a reference", create a new path rather than replacing X. Mention plan items as @plan/<uuid> per Plan References; refs inside code blocks do not resolve.`;

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
        filePath: z.string().min(1)
        .refine(
          (p) => !p.startsWith('/') && !/^[a-zA-Z]:/.test(p) && !p.includes('..'),
          'File path must be a relative path within the KPM project (e.g., "guide.md"). Do not use absolute paths from connected repositories or the local filesystem.'
        )
        .describe('Relative file path within the KPM project (e.g., "guide.md", "meeting-notes.md"). Must be relative — never an absolute path like /Users/... or a path into a connected repo.'),
        content: z.string().min(1).describe('The complete new document content (not a diff). Must be valid Markdown.'),
      },
      projectScoped(async ({ projectId, filePath, content }) => {
        toolLog(`[KPM Tools] propose_document_create ${projectId} ${filePath} (${content.length} chars)`);

        try {
          // propose_document_create is for new files — no prior content
          onDocumentUpdate({ projectId, filePath, content, oldContent: null });
        } catch (error) {
          console.error(`[KPM Tools] Error emitting document create:`, error);
          return toolError(`Failed to propose document create: ${error instanceof Error ? error.message : String(error)}`);
        }

        return jsonResult({ success: true, filePath, message: `Submitted "${filePath}" to KPM.` });
      })
    ),
  ];
}
