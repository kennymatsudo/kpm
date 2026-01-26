import { ipcMain } from 'electron';
import { createIpcHandler, createSimpleIpcHandler, PerfSchemas } from '../validation';
import { getPerfLogger, getPerfLogInfo } from '../../services/PerfLogger';

export function registerPerfHandlers(): void {
  ipcMain.handle(
    'perf:log',
    createIpcHandler(
      PerfSchemas.log,
      async ({ name, durationMs, meta }) => {
        const logger = getPerfLogger();
        if (!logger) return;
        logger.log({
          name,
          durationMs,
          meta,
          source: 'renderer',
        });
      },
      'Failed to log perf event'
    )
  );

  ipcMain.handle(
    'perf:get-log-info',
    createSimpleIpcHandler(async () => getPerfLogInfo(), 'Failed to get perf log info')
  );
}
