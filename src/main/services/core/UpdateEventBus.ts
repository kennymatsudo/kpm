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

import type { LoopOutputMode } from '../../../shared/types';

export type UpdateSource = 'github' | 'linear' | 'jira' | 'file' | 'git' | 'loop';

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

/** Generic escape hatch for sources we haven't formalized yet. */
export interface GenericUpdateEvent extends BaseUpdateEvent {
  kind: 'generic_update';
  summary: string;
  payload?: Record<string, unknown>;
}

/** A finding produced by a scheduled loop run. */
export interface LoopFindingEvent extends BaseUpdateEvent {
  kind: 'loop_finding';
  source: 'loop';
  loopId: string;
  projectId: string;
  loopName: string;
  outputMode: LoopOutputMode;
  title: string;
  body?: string;
  /** Relative artifact path, for report-mode runs. */
  artifactPath?: string;
}

export type UpdateEvent =
  | PrChangedEvent
  | TicketChangedEvent
  | BranchChangedEvent
  | GenericUpdateEvent
  | LoopFindingEvent;

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
