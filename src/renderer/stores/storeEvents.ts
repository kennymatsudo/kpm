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

import type { StatusCategory } from '../../shared/types';

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
    view: 'planning' | 'workspace';
    /** Optional request to reveal the chat surface for views that can hide it. */
    showChat?: boolean;
    /** Optional file path to open after navigation (for workspace view) */
    filePath?: string;
    /** Optional plan item ID to focus after navigation (for planning view) */
    planItemId?: string;
  };
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

export type StoreEvent =
  | StatusChangedEvent
  | PlanItemCreatedEvent
  | NavigateToViewEvent
  | RevealBoardColumnEvent
  | FileExplorerChangedEvent

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
