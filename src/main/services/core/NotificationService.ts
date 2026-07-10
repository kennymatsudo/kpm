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
 * The mapping from an `UpdateEvent` to an `AppNotification` lives in the pure,
 * exported `notificationFor` (backed by `NOTIFY_RULES`), so it can be tested by
 * handing it an event and reading the result — no fake bus required.
 *
 * Intentionally does NOT own:
 *   - Notification *display* — that's the renderer's job.
 *   - Persistence — notifications are ephemeral until proven otherwise. Add a
 *     repository when there's a feature that needs history.
 *   - Routing rules per source (quiet hours, batching) — punt until a real
 *     user request makes the rules concrete.
 */

import type { AppNotification } from '../../../shared/types';
import type { EventOfKind, UpdateEvent, UpdateEventBus, UpdateEventKind } from './UpdateEventBus';
import { notificationEvents } from '../../../shared/ipc/notificationEvents';

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
export const NOTIFICATION_CHANNEL = notificationEvents.new.channel;

// =============================================================================
// Mapping: UpdateEvent → Notification
//
// One rule per event kind. Each rule owns its dedupe key and how the event
// presents to the user. A rule whose `present` returns null suppresses the
// event (it is observability-only and never reaches a surface). Because
// `NOTIFY_RULES` is keyed over the whole union, a new event kind won't compile
// until it declares a rule and decides explicitly whether it notifies.
// =============================================================================

/** The user-facing half of a notification — the id/timestamp are stamped by `notificationFor`. */
type NotificationBody = Pick<AppNotification, 'severity' | 'title' | 'body' | 'link'>;

interface NotifyRule<K extends UpdateEventKind> {
  dedupeKey: (event: EventOfKind<K>) => string;
  /** Return the presentation, or null to suppress this event. */
  present: (event: EventOfKind<K>) => NotificationBody | null;
}

const prTitleByChange: Record<EventOfKind<'pr_changed'>['change'], string> = {
  new_review_threads: 'New review feedback',
  new_comments: 'New comments',
  status_changed: 'status changed',
  checks_changed: 'checks updated',
  merged: 'merged',
  closed: 'closed',
};

const ticketTitleByChange: Record<EventOfKind<'ticket_changed'>['change'], (key: string) => string> = {
  status_changed: (key) => `${key} status changed`,
  assignee_changed: (key) => `${key} assignee changed`,
  new_comment: (key) => `New comment on ${key}`,
  description_changed: (key) => `${key} description updated`,
  closed: (key) => `${key} closed`,
};

const NOTIFY_RULES: { [K in UpdateEventKind]: NotifyRule<K> } = {
  pr_changed: {
    dedupeKey: (event) => `pr:${event.repoId}:${event.prNumber}:${event.change}`,
    present: (event) => {
      const suffix = prTitleByChange[event.change];
      const title =
        event.change === 'new_review_threads' || event.change === 'new_comments'
          ? `${suffix} on PR #${event.prNumber}`
          : `PR #${event.prNumber} ${suffix}`;
      return {
        severity: event.change === 'merged' ? 'success' : 'info',
        title,
        body: event.summary,
        link: event.sessionId
          ? { kind: 'session', id: event.sessionId }
          : { kind: 'pr', id: `${event.repoId}#${event.prNumber}` },
      };
    },
  },
  ticket_changed: {
    dedupeKey: (event) => `ticket:${event.source}:${event.externalKey}:${event.change}`,
    present: (event) => ({
      severity: 'info',
      title: ticketTitleByChange[event.change](event.externalKey),
      body: event.summary,
      link: event.planItemId
        ? { kind: 'plan_item', id: event.planItemId }
        : { kind: 'external', id: event.externalKey },
    }),
  },
  branch_changed: {
    // Observability-only — branch changes don't warrant a user notification.
    dedupeKey: (event) => `branch:${event.repoId}:${event.branch ?? 'null'}`,
    present: () => null,
  },
  generic_update: {
    dedupeKey: (event) => `generic:${event.source}:${event.summary}`,
    present: (event) => ({ severity: 'info', title: event.summary }),
  },
  loop_finding: {
    dedupeKey: (event) => `loop:${event.loopId}:${event.title}`,
    present: (event) => ({ severity: 'info', title: event.title, body: event.body }),
  },
};

function ruleFor<K extends UpdateEventKind>(kind: K): NotifyRule<K> {
  return NOTIFY_RULES[kind];
}

/** Stable dedupe key for an event, independent of whether it notifies. */
export function dedupeKeyFor(event: UpdateEvent): string {
  return ruleFor(event.kind).dedupeKey(event);
}

/**
 * Map an `UpdateEvent` to the notification the user should see, or null when
 * the event is observability-only. Pure — this is the notification module's
 * test surface.
 */
export function notificationFor(event: UpdateEvent): AppNotification | null {
  const body = ruleFor(event.kind).present(event);
  if (!body) return null;
  return {
    ...body,
    id: `${event.kind}-${event.detectedAt}-${Math.random().toString(36).slice(2, 8)}`,
    at: event.detectedAt,
    source: event.source,
    eventKind: event.kind,
  };
}

// =============================================================================
// Factory
// =============================================================================

export function createNotificationService(deps: NotificationServiceDeps) {
  const dedupeWindowMs = deps.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  const recent = new Map<string, number>(); // dedupe key → timestamp

  function isDuplicate(event: UpdateEvent): boolean {
    const key = dedupeKeyFor(event);
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
    const notification = notificationFor(event);
    if (!notification) return;
    if (isDuplicate(event)) return;

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
