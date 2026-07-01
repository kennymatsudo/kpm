/**
 * NotificationService
 *
 * Subscribes to the UpdateEventBus and decides which events become
 * user-visible notifications. Owns:
 *
 *   - Dedupe: collapse repeated identical events inside a short window so
 *     fast-firing pollers don't spam the user.
 *   - Fan-out: broadcast a stable `notification:new` payload to renderer
 *     windows so any UI surface (toast, badge, panel) can subscribe.
 *
 * Intentionally does NOT own:
 *   - Notification *display* — that's the renderer's job.
 *   - Persistence — notifications are ephemeral until proven otherwise. Add a
 *     repository when there's a feature that needs history.
 *   - Routing rules per source (quiet hours, batching) — punt until a real
 *     user request makes the rules concrete.
 */

import type { AppNotification } from '../../../shared/types';
import type { UpdateEvent, UpdateEventBus } from './UpdateEventBus';

export interface NotificationServiceDeps {
  bus: UpdateEventBus;
  broadcastToWindows: (channel: string, payload: unknown) => void;
  /**
   * Window during which an identical event is suppressed. Defaults to 30s,
   * which is short enough to feel responsive but long enough to swallow
   * back-to-back ticks of the same poller.
   */
  dedupeWindowMs?: number;
}

const DEFAULT_DEDUPE_WINDOW_MS = 30 * 1000;
export const NOTIFICATION_CHANNEL = 'notification:new';

// =============================================================================
// Mapping: UpdateEvent → Notification
// =============================================================================

function buildDedupeKey(event: UpdateEvent): string {
  switch (event.kind) {
    case 'pr_changed':
      return `pr:${event.repoId}:${event.prNumber}:${event.change}`;
    case 'ticket_changed':
      return `ticket:${event.source}:${event.externalKey}:${event.change}`;
    case 'branch_changed':
      return `branch:${event.repoId}:${event.branch ?? 'null'}`;
    case 'generic_update':
      return `generic:${event.source}:${event.summary}`;
    case 'loop_finding':
      return `loop:${event.loopId}:${event.title}`;
  }
}

function shouldNotify(event: UpdateEvent): boolean {
  // Branch changes are observability-only — they don't warrant a user notification.
  if (event.kind === 'branch_changed') return false;
  return true;
}

function eventToNotification(event: UpdateEvent): AppNotification {
  const base = {
    id: `${event.kind}-${event.detectedAt}-${Math.random().toString(36).slice(2, 8)}`,
    at: event.detectedAt,
    source: event.source,
    eventKind: event.kind,
  };

  switch (event.kind) {
    case 'pr_changed': {
      const titleByChange: Record<typeof event.change, string> = {
        new_review_threads: `New review feedback on PR #${event.prNumber}`,
        new_comments: `New comments on PR #${event.prNumber}`,
        status_changed: `PR #${event.prNumber} status changed`,
        checks_changed: `PR #${event.prNumber} checks updated`,
        merged: `PR #${event.prNumber} merged`,
        closed: `PR #${event.prNumber} closed`,
      };
      return {
        ...base,
        severity: event.change === 'merged' ? 'success' : 'info',
        title: titleByChange[event.change],
        body: event.summary,
        link: event.sessionId
          ? { kind: 'session', id: event.sessionId }
          : { kind: 'pr', id: `${event.repoId}#${event.prNumber}` },
      };
    }
    case 'ticket_changed': {
      const titleByChange: Record<typeof event.change, string> = {
        status_changed: `${event.externalKey} status changed`,
        assignee_changed: `${event.externalKey} assignee changed`,
        new_comment: `New comment on ${event.externalKey}`,
        description_changed: `${event.externalKey} description updated`,
        closed: `${event.externalKey} closed`,
      };
      return {
        ...base,
        severity: 'info',
        title: titleByChange[event.change],
        body: event.summary,
        link: event.planItemId
          ? { kind: 'plan_item', id: event.planItemId }
          : { kind: 'external', id: event.externalKey },
      };
    }
    case 'generic_update':
      return {
        ...base,
        severity: 'info',
        title: event.summary,
      };
    case 'loop_finding':
      return {
        ...base,
        severity: 'info',
        title: event.title,
        body: event.body,
      };
    case 'branch_changed':
      // Filtered above by shouldNotify, but fall through cleanly anyway.
      return {
        ...base,
        severity: 'info',
        title: `Branch changed: ${event.branch ?? 'detached'}`,
      };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createNotificationService(deps: NotificationServiceDeps) {
  const dedupeWindowMs = deps.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  const recent = new Map<string, number>(); // dedupe key → timestamp

  function isDuplicate(event: UpdateEvent): boolean {
    const key = buildDedupeKey(event);
    const now = Date.now();
    const last = recent.get(key);
    if (last !== undefined && now - last < dedupeWindowMs) {
      return true;
    }
    recent.set(key, now);

    // Opportunistic GC so the map can't grow unbounded over a long session.
    if (recent.size > 256) {
      for (const [k, ts] of recent) {
        if (now - ts >= dedupeWindowMs) recent.delete(k);
      }
    }
    return false;
  }

  function handle(event: UpdateEvent): void {
    if (!shouldNotify(event)) return;
    if (isDuplicate(event)) return;

    const notification = eventToNotification(event);
    deps.broadcastToWindows(NOTIFICATION_CHANNEL, notification);
  }

  let unsubscribe: (() => void) | null = null;

  return {
    start(): void {
      if (unsubscribe) return;
      unsubscribe = deps.bus.onAny(handle);
      console.log('[NotificationService] Subscribed to update event bus');
    },

    stop(): void {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      recent.clear();
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
