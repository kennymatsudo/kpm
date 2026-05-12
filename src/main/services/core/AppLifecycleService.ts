import type { SearchService } from './SearchService';
import type { DevSessionService } from '../repo/DevSessionService';
import type { ChatRuntimeService } from './ChatRuntimeService';
import type { RepoWatcherService } from '../repo/RepoWatcherService';
import type { ProjectWatcherService } from '../files/ProjectWatcherService';
import type { PollScheduler } from './PollScheduler';
import type { NotificationService } from './NotificationService';
import type { TerminalService } from '../streaming/TerminalService';

export interface AppLifecycleServiceDeps {
  searchService: Pick<SearchService, 'startBackgroundIndexing' | 'disposeBackgroundIndexing'>;
  devSessionService: Pick<DevSessionService, 'markActiveAsInactive'>;
  pollScheduler: Pick<PollScheduler, 'stopAll'>;
  repoWatcherService?: Pick<RepoWatcherService, 'unwatchAll'>;
  projectWatcherService?: Pick<ProjectWatcherService, 'unwatchProject'>;
  notificationService?: Pick<NotificationService, 'stop'>;
  terminalService?: Pick<TerminalService, 'shutdown'>;
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

      // Stop scheduled pollers first so no new work is queued during teardown.
      try {
        deps.pollScheduler.stopAll();
      } catch (err) {
        console.error('[AppLifecycleService] Error stopping poll scheduler:', err);
      }

      if (chatRuntime) {
          console.error('[AppLifecycleService] Error during session cleanup:', err);
        });
      }


      try {
        deps.repoWatcherService?.unwatchAll();
      } catch (err) {
        console.error('[AppLifecycleService] Error stopping repo watchers:', err);
      }

      try {
        deps.notificationService?.stop();
      } catch (err) {
        console.error('[AppLifecycleService] Error stopping notification service:', err);
      }

      try {
        deps.terminalService?.shutdown();
      } catch (err) {
        console.error('[AppLifecycleService] Error shutting down terminal service:', err);
      }

      deps.disposeClaudeClients();
    },
  };
}

export type AppLifecycleService = ReturnType<typeof createAppLifecycleService>;
