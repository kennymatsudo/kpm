import { createRegistryIpcHandlers } from '../validation/utils';
import { perfEndpoints, type PerfEndpointName } from '../../../shared/ipc/perfEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import { getPerfLogger, getPerfLogInfo } from '../../services/PerfLogger';

/**
 * One handler per `perfEndpoints` entry. A registry entry without a matching
 * key here is a compile error, not a runtime "no handler" failure.
 */
type PerfHandlers = { [K in PerfEndpointName]: UnwrappedHandlerFor<typeof perfEndpoints, K> };

const handlers: PerfHandlers = {
  log: async ({ name, durationMs, meta }) => {
    const logger = getPerfLogger();
    if (!logger) return;
    logger.log({
      name,
      durationMs,
      meta,
      source: 'renderer',
    });
  },

  getLogInfo: async () => getPerfLogInfo(),
};

export function registerPerfHandlers(): void {
  createRegistryIpcHandlers(perfEndpoints, handlers, 'Failed to log perf event');
}
