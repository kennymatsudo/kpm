/**
 * Briefing Tools
 *
 * MCP tool that generates a project briefing by gathering SQL context
 */

import { z } from 'zod';
import { tool, toolResult, toolError } from './index';

  return [
    tool(
      'get_briefing',
      'Generate a prioritized project briefing. Analyzes plan items, blocked work, stale tasks, dev sessions, and recent chat history to produce actionable recommendations. Use this when the user asks "what should I do next?", "what\'s the status?", or wants a project overview.',
      {
        projectId: z.string().uuid().describe('The project UUID'),
      },
      async ({ projectId }) => {

        if (!result.ok) {
          return toolError(result.error);
        }

        const { summary, signalCounts, generatedAt } = result.data;

        return toolResult(`## Project Briefing (${new Date(generatedAt).toLocaleString()})

**Signals:** ${signalCounts.blockedCount} blocked, ${signalCounts.staleCount} stale, ${signalCounts.readyCount} ready

${summary}`);
      },
      { annotations: { readOnlyHint: true } }
    ),
  ];
}
