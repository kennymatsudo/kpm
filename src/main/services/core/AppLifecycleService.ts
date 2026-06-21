import type { SearchService } from './SearchService';
import type { DevSessionService } from '../repo/DevSessionService';
import type { ChatRuntimeService } from './ChatRuntimeService';
import type { RepoWatcherService } from '../repo/RepoWatcherService';
import type { ProjectWatcherService } from '../files/ProjectWatcherService';
import type { PollScheduler } from './PollScheduler';
import type { NotificationService } from './NotificationService';
import type { TerminalService } from '../streaming/TerminalService';
import type { AgentSessionManager } from '../agents/AgentSessionManager';
import type { HookServer } from '../agents/hookServer';
import type { FileSummaryService } from '../files/FileSummaryService';

export interface AppLifecycleServiceDeps {
  searchService: Pick<SearchService, 'startBackgroundIndexing' | 'disposeBackgroundIndexing'>;
  devSessionService: Pick<DevSessionService, 'markActiveAsInactive'>;
  pollScheduler: Pick<PollScheduler, 'stopAll'>;
  repoWatcherService?: Pick<RepoWatcherService, 'unwatchAll'>;
  projectWatcherService?: Pick<ProjectWatcherService, 'unwatchProject'>;
  notificationService?: Pick<NotificationService, 'stop'>;
  terminalService?: Pick<TerminalService, 'shutdown'>;
  agentSessionManager?: Pick<AgentSessionManager, 'stopAll'>;
  hookServer?: Pick<HookServer, 'stop'>;
  fileSummaryService?: Pick<FileSummaryService, 'dispose'>;
  disposeClaudeClients: () => void;
}

export function createAppLifecycleService(deps: AppLifecycleServiceDeps) {
  let startupApplied = false;
  let shutdownApplied = false;
  let chatRuntime: Pick<ChatRuntimeService, 'streamingSessionService'> | null = null;

  return {
    attachChatRuntime(runtime: Pick<ChatRuntimeService, 'streamingSessionService'>): void {
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

    async shutdown(): Promise<void> {
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

      try {
        deps.fileSummaryService?.dispose();
      } catch (err) {
        console.error('[AppLifecycleService] Error disposing file summaries:', err);
      }

      if (chatRuntime) {
        await chatRuntime.streamingSessionService.disposeAll().catch((err) => {
          console.error('[AppLifecycleService] Error during session cleanup:', err);
        });
      }

      await deps.agentSessionManager?.stopAll().catch((err) => {
        console.error('[AppLifecycleService] Error stopping agent sessions:', err);
      });

      await deps.hookServer?.stop().catch((err) => {
        console.error('[AppLifecycleService] Error stopping hook server:', err);
      });

      // Await both watcher teardowns so no in-flight unsubscribe async ops remain
      // when Electron starts tearing down the NAPI environment. Fire-and-forgetting
      // these caused PromiseRunner::onWorkComplete to fire against a partially-torn-
      // down NAPI env, triggering napi_fatal_error → abort().
      await Promise.all([
        deps.searchService.disposeBackgroundIndexing().catch((err) => {
          console.error('[AppLifecycleService] Error during search indexer cleanup:', err);
        }),
        deps.projectWatcherService?.unwatchProject().catch((err) => {
          console.error('[AppLifecycleService] Error unwatching project:', err);
        }),
      ]);

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
