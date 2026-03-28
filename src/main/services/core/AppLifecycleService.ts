import type { SearchService } from './SearchService';
import type { DevSessionService } from '../repo/DevSessionService';
import type { ChatRuntimeService } from './ChatRuntimeService';

export interface AppLifecycleServiceDeps {
  searchService: Pick<SearchService, 'startBackgroundIndexing' | 'disposeBackgroundIndexing'>;
  devSessionService: Pick<DevSessionService, 'markActiveAsInactive'>;
  disposeClaudeClients: () => void;
}

export function createAppLifecycleService(deps: AppLifecycleServiceDeps) {
  let startupApplied = false;
  let shutdownApplied = false;

  return {
      chatRuntime = runtime;
    },

    start(): void {
      if (startupApplied) {
        return;
      }
      startupApplied = true;

      deps.searchService.startBackgroundIndexing();
      deps.devSessionService.markActiveAsInactive();
    },

      if (shutdownApplied) {
        return;
      }
      shutdownApplied = true;

      if (chatRuntime) {
          console.error('[AppLifecycleService] Error during session cleanup:', err);
        });
      }


      deps.disposeClaudeClients();
    },
  };
}

export type AppLifecycleService = ReturnType<typeof createAppLifecycleService>;
