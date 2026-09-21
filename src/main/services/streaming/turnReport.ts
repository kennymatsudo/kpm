import type { BrowserWindow } from 'electron';
import { emitAppEvent } from '../../../shared/ipc/appEvents';
import { chatEvents, type TurnDoneEventData } from '../../../shared/ipc/chatEvents';
import type { SessionState } from './chatSessionLaunch';
import type { TurnLifecycle } from './turnLifecycle';

export type TurnOutcome = Omit<TurnDoneEventData, 'projectId' | 'chatSessionId'>;

/**
 * Why a turn is ending, with what each cause needs to say for itself.
 *
 * - `result` — the provider answered. The only cause that can hand off to a
 *   queued follow-up, and the only one that never deactivates the session.
 * - `timed-out` — the harness gave up on a turn that stopped responding.
 * - `disconnected` — the service tore the session down; it reports the turn
 *   ended even if something already settled it, because a renderer holding
 *   leftover activities still needs a finalized bubble.
 * - `session-ended` — the provider's own end callback. Stays quiet when the
 *   turn already finished, so a post-turn teardown cannot flip renderer state
 *   back mid-recovery.
 */
export type TurnEnd =
  | { cause: 'result'; hasQueuedFollowUp: boolean; outcome: TurnOutcome }
  | { cause: 'timed-out' }
  | { cause: 'disconnected'; silent: boolean; reason: string; source: string; previousState: SessionState }
  | {
      cause: 'session-ended';
      reason: string;
      source: string;
      previousState: SessionState;
      /** The session asked for silence regardless of how the turn ended. */
      suppressLifecycle: boolean;
      error?: string;
    };

/**
 * One session's turn-end reporting: settlement and the renderer events that
 * follow from it, with the session's identity and window lookup bound in.
 *
 * Settlement used to be a boolean each of the four ending paths interpreted
 * for itself — one emitted on it, one ignored it, one inverted it, one guarded
 * on it — so the rule for what reaches the renderer lived in four places and
 * three comments. `endTurn` is now the only way a turn ends.
 */
export interface TurnReport {
  endTurn(end: TurnEnd): void;
}

export interface TurnReportDeps {
  turn: TurnLifecycle;
  projectId: string;
  getChatSessionId: () => string | undefined;
  getMainWindow: () => BrowserWindow | null;
}

export function createTurnReport(deps: TurnReportDeps): TurnReport {
  function endTurn(end: TurnEnd): void {
    const settledHere = deps.turn.settle(end.cause);
    const mainWindow = deps.getMainWindow();
    const ids = { projectId: deps.projectId, chatSessionId: deps.getChatSessionId() };

    switch (end.cause) {
      case 'result': {
        if (!end.hasQueuedFollowUp) {
          emitAppEvent(mainWindow?.webContents, chatEvents.sessionReady, ids);
        }
        if (settledHere) {
          emitAppEvent(mainWindow?.webContents, chatEvents.done, { ...ids, ...end.outcome });
        }
        return;
      }

      case 'timed-out': {
        if (settledHere) {
          emitAppEvent(mainWindow?.webContents, chatEvents.done, ids);
        }
        return;
      }

      case 'disconnected': {
        if (end.silent) return;
        emitAppEvent(mainWindow?.webContents, chatEvents.sessionDeactivated, {
          ...ids,
          reason: end.reason,
          source: end.source,
          previousState: end.previousState,
        });
        emitAppEvent(mainWindow?.webContents, chatEvents.done, ids);
        return;
      }

      case 'session-ended': {
        // A turn that ended before this callback means the renderer already has
        // its finalized bubble; re-announcing teardown would undo it. A session
        // being closed deliberately still reports, so its tab stops looking live.
        if (end.suppressLifecycle || (!settledHere && end.previousState !== 'closing')) return;

        emitAppEvent(mainWindow?.webContents, chatEvents.sessionDeactivated, {
          ...ids,
          reason: end.reason,
          source: end.source,
          previousState: end.previousState,
        });
        emitAppEvent(mainWindow?.webContents, chatEvents.done, ids);
        if (end.error) {
          emitAppEvent(mainWindow?.webContents, chatEvents.sessionError, { ...ids, error: end.error });
        }
        return;
      }
    }
  }

  return { endTurn };
}
