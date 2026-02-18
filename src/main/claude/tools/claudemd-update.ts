/**
 *
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';

export interface ClaudeMdUpdatePayload {
  projectId: string;
  chatSessionId?: string;
  newContent: string;
}

export type ClaudeMdUpdateCallback = (update: ClaudeMdUpdatePayload) => void;


/**
 */

/**
 *
 */
export function createClaudeMdEditTools(
) {

  return [
    tool(
      TOOL_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        new_string: z.string().describe('The replacement text. Can be empty to delete the old_string.'),
      },
      async ({ projectId, old_string, new_string }) => {

        try {
        } catch (error) {
        }

        }

        // Validate old_string exists and is unique
        const firstIndex = currentContent.indexOf(old_string);
        if (firstIndex === -1) {
        }

        const secondIndex = currentContent.indexOf(old_string, firstIndex + 1);
        if (secondIndex !== -1) {
        }

        // Validate not a no-op
        if (old_string === new_string) {
          return toolError('old_string and new_string are identical. No change would be made.');
        }

        // Apply edit
        const newContent = currentContent.slice(0, firstIndex) + new_string + currentContent.slice(firstIndex + old_string.length);

        try {
        } catch (error) {
        }

          success: true,
      }
    ),
  ];
}
