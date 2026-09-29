/**
 * Project Context File Edit Tool
 *
 * Allows chat providers to submit edits to the project context file (AGENTS.md / CLAUDE.md)
 * using old_string → new_string. Only the changed portion is sent as output tokens;
 * the full new content is computed server-side and emitted as a ContextFileUpdatePayload.
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError, toolLog, projectScoped } from './index';

export interface ContextFileUpdatePayload {
  projectId: string;
  chatSessionId?: string;
  newContent: string;
  /**
   * The context file's content immediately before this proposal, captured by
   * the tool. Avoids a second disk read in the subscriber for diff display.
   */
  oldContent: string | null;
  /** The resolved context filename — AGENTS.md or CLAUDE.md. */
  filename: string;
}

export type ContextFileUpdateCallback = (update: ContextFileUpdatePayload) => void;

/**
 * Reads the project context file. Returns the content + which filename
 * (AGENTS.md / CLAUDE.md) was actually read, so the subscriber doesn't have to
 * re-resolve.
 */
export type ReadProjectContextFileFn = (
  projectId: string
) => Promise<{ content: string; filename: string } | null>;

/**
 * Tool description with embedded best practices for KPM's project management context.
 */
const TOOL_DESCRIPTION = `Propose an edit to the project context file (AGENTS.md or CLAUDE.md), the persistent notes loaded into every future chat in this project. Use it when the user asks to remember something for later sessions, or to correct what the file says. KPM queues the edit for review or applies it, per the user's setting. old_string must match exactly one place in the file, whitespace included; add surrounding text if it is not unique.

What belongs there: connected repos and their key folders, plan and tracker conventions, important paths, commands, and gotchas, as short bullets under ## sections, within about 200 lines. Leave out code snippets, anything the repos' own READMEs cover, and notes that only matter to this conversation.`;

/**
 * Create the project context file edit tool.
 *
 * @param readContextFile - Function to read project context file content for a project
 * @param onContextFileUpdate - Callback to emit proposed update to the UI for approval
 */
export function createContextFileEditTools(
  readContextFile: ReadProjectContextFileFn,
  onContextFileUpdate: ContextFileUpdateCallback
) {
  return [
    tool(
      'propose_context_edit',
      TOOL_DESCRIPTION,
      {
        old_string: z.string().min(1).describe('The exact text to find in the project context file. Must match exactly one location.'),
        new_string: z.string().describe('The replacement text. Can be empty to delete the old_string.'),
      },
      projectScoped(async ({ projectId, old_string, new_string }) => {
        toolLog(`[KPM Tools] propose_context_edit ${projectId} (old=${old_string.length} new=${new_string.length})`);

        // Read current project context file content
        let currentRead: { content: string; filename: string } | null;
        try {
          currentRead = await readContextFile(projectId);
        } catch (error) {
          console.error(`[KPM Tools] Error reading project context file:`, error);
          return toolError(`Failed to read project context file: ${error instanceof Error ? error.message : String(error)}`);
        }

        if (currentRead === null) {
          return toolError('Project context file not found. Neither AGENTS.md nor CLAUDE.md exists for this project.');
        }

        const { content: currentContent, filename: contextFilename } = currentRead;

        // Validate old_string exists and is unique
        const firstIndex = currentContent.indexOf(old_string);
        if (firstIndex === -1) {
          return toolError('old_string not found in project context file. Read the file first to get the exact text including whitespace.');
        }

        const secondIndex = currentContent.indexOf(old_string, firstIndex + 1);
        if (secondIndex !== -1) {
          return toolError('old_string appears multiple times in the project context file. Include more surrounding context to make the match unique.');
        }

        // Validate not a no-op
        if (old_string === new_string) {
          return toolError('old_string and new_string are identical. No change would be made.');
        }

        // Apply edit
        const newContent = currentContent.slice(0, firstIndex) + new_string + currentContent.slice(firstIndex + old_string.length);

        try {
          // Pass the pre-edit content + resolved filename forward so the
          // subscriber doesn't re-read disk.
          onContextFileUpdate({
            projectId,
            newContent,
            oldContent: currentContent,
            filename: contextFilename,
          });
        } catch (error) {
          console.error(`[KPM Tools] Error emitting project context edit:`, error);
          return toolError(`Failed to propose edit: ${error instanceof Error ? error.message : String(error)}`);
        }

        return jsonResult({
          success: true,
          message: 'Project context file edit submitted to KPM.',
        });
      })
    ),
  ];
}
