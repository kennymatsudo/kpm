/**
 * UpdateEventBus
 *
 * Typed in-process event bus for "something changed externally" signals from
 * pollers. Decouples sources (GitHub PR poller, future Linear/Jira pollers,
 * file watchers) from consumers (NotificationService, UI broadcasts, metrics).
 *
 * Why a discriminated union instead of EventEmitter strings:
 *   - Adding a new source = adding one variant. The compiler tells every
 *     consumer it needs to handle (or explicitly ignore) the new case.
 *   - Subscribers can filter by `kind` with full type narrowing.
 *
 * Why in-process (no IPC, no DB):
 *   - All current consumers run in the main process. The bus stays cheap.
 *   - Consumers that need to reach the renderer (UI toasts) can do so via
 *     `broadcastToWindows` themselves; the bus does not impose a transport.
 */

// =============================================================================
// Event Variants
// =============================================================================

import type {
  DevSessionAttentionReason,
  DevSessionAutomationPhase,
  DevSessionPausedReason,
} from '../../../shared/types';

export type UpdateSource = 'github' | 'linear' | 'jira' | 'file' | 'git' | 'action' | 'agent';

export interface BaseUpdateEvent {
  /** Event kind — discriminator for the union. */
  kind: string;
  /** Source system that emitted the event. */
  source: UpdateSource;
  /** ISO timestamp of when the change was detected (not when it happened upstream). */
  detectedAt: string;
}

export interface PrChangedEvent extends BaseUpdateEvent {
  kind: 'pr_changed';
  source: 'github';
  /** Owning project. Notifications need it to say (and reach) where this happened. */
  projectId: string;
  /** KPM dev session id, when the PR is linked to one. */
  sessionId?: string;
  prNumber: number;
  /** Repo identifier — opaque to the bus. */
  repoId: string;
  /** What changed — for filtering and UI grouping. */
  change:
    | 'new_review_threads'
    | 'new_comments'
    | 'status_changed'
    | 'checks_changed'
    | 'merged'
    | 'closed';
  /** Optional human-readable summary. */
  summary?: string;
}

export interface TicketChangedEvent extends BaseUpdateEvent {
  kind: 'ticket_changed';
  source: 'linear' | 'jira';
  /** Owning project. Notifications need it to say (and reach) where this happened. */
  projectId: string;
  /** External ticket id (e.g. "ENG-1234"). */
  externalKey: string;
  /** KPM plan item id, when linked. */
  planItemId?: string;
  change:
    | 'status_changed'
    | 'assignee_changed'
    | 'new_comment'
    | 'description_changed'
    | 'closed';
  summary?: string;
}

export interface BranchChangedEvent extends BaseUpdateEvent {
  kind: 'branch_changed';
  source: 'git';
  repoId: string;
  repoPath: string;
  branch: string | null;
}

/** A finding produced by an action run. */
export interface ActionFindingEvent extends BaseUpdateEvent {
  kind: 'action_finding';
  source: 'action';
  actionId: string;
  projectId: string;
  actionName: string;
  title: string;
  body?: string;
  /** Relative path to the file the run wrote, when it wrote one. */
  artifactPath?: string;
}

/**
 * The automation phases worth interrupting the user for: the run finished, it
 * needs a decision, or it stopped at a gate. Every other phase is mid-flight,
 * and the board card already shows that.
 */
export const BOARD_AGENT_NOTIFY_PHASES = [
  'ready_for_review',
  'needs_attention',
  'paused',
] as const satisfies readonly DevSessionAutomationPhase[];

export type BoardAgentNotifyPhase = (typeof BOARD_AGENT_NOTIFY_PHASES)[number];

export function isBoardAgentNotifyPhase(
  phase: DevSessionAutomationPhase | null,
): phase is BoardAgentNotifyPhase {
  return phase !== null && (BOARD_AGENT_NOTIFY_PHASES as readonly string[]).includes(phase);
}

/** A board agent session settled into a phase that wants the user's attention. */
export interface BoardAgentEvent extends BaseUpdateEvent {
  kind: 'board_agent';
  source: 'agent';
  devSessionId: string;
  projectId: string;
  planItemId: string | null;
  /** Label for the work the session is doing, when one can be resolved. */
  taskName: string | null;
  phase: BoardAgentNotifyPhase;
  /** Why automation paused; only meaningful when `phase` is 'paused'. */
  pausedReason: DevSessionPausedReason | null;
  /** Why automation could not continue; only meaningful for `needs_attention`. */
  attentionReason: DevSessionAttentionReason | null;
}

export type UpdateEvent =
  | PrChangedEvent
  | TicketChangedEvent
  | BranchChangedEvent
  | ActionFindingEvent
  | BoardAgentEvent;

export type UpdateEventKind = UpdateEvent['kind'];

// Narrowed event lookup: `EventOfKind<'pr_changed'>` resolves to PrChangedEvent.
export type EventOfKind<K extends UpdateEventKind> = Extract<UpdateEvent, { kind: K }>;

// =============================================================================
// Bus
// =============================================================================

export type UpdateEventListener<E extends UpdateEvent = UpdateEvent> = (event: E) => void;

interface ListenerEntry {
  kind: UpdateEventKind | '*';
  listener: UpdateEventListener;
}

export function createUpdateEventBus() {
  const listeners = new Set<ListenerEntry>();

  /**
   * Subscribe to a specific event kind. Returns an unsubscribe function.
   */
  function on<K extends UpdateEventKind>(
    kind: K,
    listener: UpdateEventListener<EventOfKind<K>>,
  ): () => void {
    const entry: ListenerEntry = {
      kind,
      listener: listener as UpdateEventListener,
    };
    listeners.add(entry);
    return () => listeners.delete(entry);
  }

  /**
   * Subscribe to every event regardless of kind. Useful for logging/metrics.
   */
  function onAny(listener: UpdateEventListener): () => void {
    const entry: ListenerEntry = { kind: '*', listener };
    listeners.add(entry);
    return () => listeners.delete(entry);
  }

  /**
   * Emit an event to all matching listeners. Listener errors are caught and
   * logged so one bad consumer cannot poison the bus.
   */
  function emit(event: UpdateEvent): void {
    for (const entry of listeners) {
      if (entry.kind !== '*' && entry.kind !== event.kind) continue;
      try {
        entry.listener(event);
      } catch (error) {
        console.error(
          `[UpdateEventBus] Listener for '${entry.kind}' threw on event '${event.kind}':`,
          error,
        );
      }
    }
  }

  function listenerCount(): number {
    return listeners.size;
  }

  function clear(): void {
    listeners.clear();
  }

  return { on, onAny, emit, listenerCount, clear };
}

export type UpdateEventBus = ReturnType<typeof createUpdateEventBus>;
