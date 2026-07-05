import { toolLogEndpoints, type ToolLogEndpointName } from '../../../shared/ipc/toolLogEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import type { ToolCallLogger } from '../../services/toollog';
import { createRegistryIpcHandlers } from '../validation/utils';

/**
 * One handler per `toolLogEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type ToolLogHandlers = { [K in ToolLogEndpointName]: UnwrappedHandlerFor<typeof toolLogEndpoints, K> };

function buildToolLogHandlers(toolCallLogger: ToolCallLogger): ToolLogHandlers {
  return {
    getEntries: ({ chatSessionId }) => ({ entries: toolCallLogger.getEntriesForSession(chatSessionId) }),

    getSessionStats: ({ chatSessionId }) => ({ stats: toolCallLogger.getSessionStats(chatSessionId) }),

    getInfo: () => toolCallLogger.getInfo(),

    setEnabled: ({ enabled }) => {
      toolCallLogger.setEnabled(enabled);
    },
  };
}

export function registerToolLogHandlers(toolCallLogger: ToolCallLogger): void {
  createRegistryIpcHandlers(toolLogEndpoints, buildToolLogHandlers(toolCallLogger), 'Tool log operation failed');
}
