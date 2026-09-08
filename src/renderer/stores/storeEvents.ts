/**
 * Store Events - Cross-store communication via typed events.
 *
 * This module provides a typed event emitter for communication between Zustand stores
 * without creating circular dependencies. Stores emit events here, and subscribers
 * (typically set up in App.tsx or a dedicated hook) listen and dispatch to other stores.
 *
 * Pattern:
 * - Store A emits event → storeEvents
 * - Subscription hook listens → calls Store B action
 */

import type { CustomFieldValues, ReviewInboxSnapshot, StatusCategory } from '../../shared/types';

// =============================================================================
// Event Types
// =============================================================================

export interface StatusChangedEvent {
  type: 'status-changed';
  payload: {
    projectId: string;
    itemId: string;
    statusCategory: StatusCategory;
    externalKey: string;
    associationId: string;
  };
}

export interface PlanItemCreatedEvent {
  type: 'plan-item-created';
  payload: {
    projectId: string;
    itemId: string;
    /** Status category of the newly created item */
    statusCategory: StatusCategory | null;
    /** Origin of the item: 'local' for newly created, or 'jira'/'linear' for imports */
    syncSource: 'local' | 'jira' | 'linear';
  };
}

export interface NavigateToViewEvent {
  type: 'navigate-to-view';
  payload: {
    /**
     * Omit to stay in whatever view is showing. Used when the target isn't
     * view-specific (a chat tab exists in both) and switching views would be a
     * gratuitous surprise.
     */
    view?: 'planning' | 'workspace';
    /** Optional request to reveal the chat surface for views that can hide it. */
    showChat?: boolean;
    /** Optional file path to open after navigation (for workspace view) */
    filePath?: string;
    /** Optional plan item ID to focus after navigation (for planning view) */
    planItemId?: string;
    /**
     * Optional dev session whose detail pane should open. Forces the planning
     * view into board mode, since that is the only mode with a detail pane.
     */
    boardSessionId?: string;
    /**
     * Optional chat tab to focus, revealing the chat panel. Used to land the
     * user on the session that is blocked waiting for them.
     */
    chatSessionId?: string;
  };
}

/**
 * Open a different project, optionally landing somewhere specific once it has
 * loaded. `useProjectLoader` is the only subscriber; it owns the load and
 * re-emits `then` as a `navigate-to-view` afterwards, because the target
 * (a plan item, a chat tab) only exists in the store once the project is in.
 *
 * Emitters that already know the project is open should emit
 * `navigate-to-view` directly rather than a same-project switch.
 */
export interface SwitchProjectEvent {
  type: 'switch-project';
  payload: {
    projectId: string;
    then?: NavigateToViewEvent['payload'];
  };
}

/**
 * The user closed the last chat tab. Chat has nothing left to show, so the
 * panel hides rather than conjuring a replacement session the user did not ask
 * for. Reopening it starts a conversation again.
 */
export interface ChatTabsEmptiedEvent {
  type: 'chat-tabs-emptied';
}

export interface RevealBoardColumnEvent {
  type: 'reveal-board-column';
  payload: { status: StatusCategory };
}

export interface FileExplorerChangedEvent {
  type: 'file-explorer-changed';
  payload: {
    projectId: string;
    type: 'created' | 'updated' | 'deleted' | 'renamed';
    path: string;
    newPath?: string;
    isDirectory: boolean;
  };
}

export interface ChatFileUpdatedEvent {
  type: 'chat-file-updated';
  payload: {
    projectId: string;
    chatSessionId?: string;
    filePath: string;
    content: string;
    oldContent?: string | null;
  };
}

export interface ReviewReplyAppliedEvent {
  type: 'review-reply-applied';
  payload: { sessionId: string; inbox: ReviewInboxSnapshot | null };
}

export interface TrackerExportCompletedEvent {
  type: 'tracker-export-completed';
  payload: {
    projectId: string;
    associationId: string;
  };
}

export interface SyncReviewItemRemovedEvent {
  type: 'sync-review-item-removed';
  payload: {
    queueEntryId: string;
  };
}

export interface SyncReviewCustomFieldOverridesUpdatedEvent {
  type: 'sync-review-custom-field-overrides-updated';
  payload: {
    queueEntryId: string;
    overrides: CustomFieldValues | null;
  };
}

export type StoreEvent =
  | StatusChangedEvent
  | PlanItemCreatedEvent
  | NavigateToViewEvent
  | SwitchProjectEvent
  | ChatTabsEmptiedEvent
  | RevealBoardColumnEvent
  | FileExplorerChangedEvent
  | ChatFileUpdatedEvent
  | ReviewReplyAppliedEvent
  | TrackerExportCompletedEvent
  | SyncReviewItemRemovedEvent
  | SyncReviewCustomFieldOverridesUpdatedEvent;

// =============================================================================
// Event Emitter
// =============================================================================

type EventHandler<T extends StoreEvent> = (event: T) => void;

const handlers = new Map<StoreEvent['type'], Set<EventHandler<StoreEvent>>>();

/**
 * Emit an event to all subscribers.
 */
export function emit<T extends StoreEvent>(event: T): void {
  const typeHandlers = handlers.get(event.type);
  if (typeHandlers) {
    typeHandlers.forEach((handler) => handler(event));
  }
}

/**
 * Subscribe to events of a specific type.
 * Returns an unsubscribe function.
 */
export function subscribe<T extends StoreEvent['type']>(
  type: T,
  handler: EventHandler<Extract<StoreEvent, { type: T }>>
): () => void {
  if (!handlers.has(type)) {
    handlers.set(type, new Set());
  }
  const typeHandlers = handlers.get(type)!;
  typeHandlers.add(handler as EventHandler<StoreEvent>);

  return () => {
    typeHandlers.delete(handler as EventHandler<StoreEvent>);
    if (typeHandlers.size === 0) {
      handlers.delete(type);
    }
  };
}
