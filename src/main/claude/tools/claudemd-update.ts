/**
 * Project Context File Edit Tool
 *
 * using old_string → new_string. Only the changed portion is sent as output tokens;
 * the full new content is computed server-side and emitted as a ContextFileUpdatePayload.
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';

// Keep legacy export aliases so existing imports don't break during migration
export interface ClaudeMdUpdatePayload {
  projectId: string;
  chatSessionId?: string;
  newContent: string;
}

export type ClaudeMdUpdateCallback = (update: ClaudeMdUpdatePayload) => void;


/**
 */

/**
 * Create the project context file edit tool.
 *
 * @param readContextFile - Function to read project context file content for a project
 * @param onContextFileUpdate - Callback to emit proposed update to the UI for approval
 */
export function createClaudeMdEditTools(
  readContextFile: ReadClaudeMdFn,
  onContextFileUpdate: ClaudeMdUpdateCallback
) {

  return [
    tool(
      'propose_context_edit',
      TOOL_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        old_string: z.string().min(1).describe('The exact text to find in the project context file. Must match exactly one location.'),
        new_string: z.string().describe('The replacement text. Can be empty to delete the old_string.'),
      },
      async ({ projectId, old_string, new_string }) => {

        // Read current project context file content
        try {
        } catch (error) {
          return toolError(`Failed to read project context file: ${error instanceof Error ? error.message : String(error)}`);
        }

          return toolError('Project context file not found. Neither AGENTS.md nor CLAUDE.md exists for this project.');
        }

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
        } catch (error) {
          return toolError(`Failed to propose edit: ${error instanceof Error ? error.message : String(error)}`);
        }

          success: true,
      }
    ),
  ];
}
