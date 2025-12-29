/**
 *
 */

import { z } from 'zod';

export interface ClaudeMdUpdatePayload {
  projectId: string;
  newContent: string;
}

export type ClaudeMdUpdateCallback = (update: ClaudeMdUpdatePayload) => void;

/**
 */

/**
 *
 */

  return [
    tool(
      TOOL_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
      },

        try {
        } catch (error) {
        }

          success: true,
      }
    ),
  ];
}
