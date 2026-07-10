import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNotificationService, dedupeKeyFor, notificationFor } from './NotificationService';
import type {
  BranchChangedEvent,
  GenericUpdateEvent,
  LoopFindingEvent,
  PrChangedEvent,
  TicketChangedEvent,
  UpdateEventBus,
} from './UpdateEventBus';

const AT = '2026-07-10T12:00:00.000Z';

function prEvent(overrides: Partial<PrChangedEvent> = {}): PrChangedEvent {
  return {
    kind: 'pr_changed',
    source: 'github',
    detectedAt: AT,
    prNumber: 42,
    repoId: 'repo-1',
    change: 'new_review_threads',
    summary: '2 new review thread(s)',
    ...overrides,
  };
}

function ticketEvent(overrides: Partial<TicketChangedEvent> = {}): TicketChangedEvent {
  return {
    kind: 'ticket_changed',
    source: 'linear',
    detectedAt: AT,
    externalKey: 'ENG-1234',
    change: 'status_changed',
    ...overrides,
  };
}

function branchEvent(overrides: Partial<BranchChangedEvent> = {}): BranchChangedEvent {
  return {
    kind: 'branch_changed',
    source: 'git',
    detectedAt: AT,
    repoId: 'repo-1',
    repoPath: '/tmp/repo-1',
    branch: 'main',
    ...overrides,
  };
}

function genericEvent(overrides: Partial<GenericUpdateEvent> = {}): GenericUpdateEvent {
  return {
    kind: 'generic_update',
    source: 'github',
    detectedAt: AT,
    summary: 'Something happened',
    ...overrides,
  };
}

function loopEvent(overrides: Partial<LoopFindingEvent> = {}): LoopFindingEvent {
  return {
    kind: 'loop_finding',
    source: 'loop',
    detectedAt: AT,
    loopId: 'loop-1',
    projectId: 'proj-1',
    loopName: 'Nightly sweep',
    outputMode: 'notify',
    title: 'Found a flaky test',
    body: 'auth.spec.ts fails intermittently',
    ...overrides,
  };
}

describe('notificationFor', () => {
  it('carries the event identity fields onto every notification', () => {
    const n = notificationFor(loopEvent());
    expect(n).toMatchObject({ at: AT, source: 'loop', eventKind: 'loop_finding' });
    expect(n?.id).toMatch(/^loop_finding-/);
  });

  describe('pr_changed', () => {
    it('phrases review/comment changes as "on PR #N" and others as "PR #N ..."', () => {
      expect(notificationFor(prEvent({ change: 'new_review_threads' }))?.title).toBe(
        'New review feedback on PR #42',
      );
      expect(notificationFor(prEvent({ change: 'new_comments' }))?.title).toBe('New comments on PR #42');
      expect(notificationFor(prEvent({ change: 'status_changed' }))?.title).toBe('PR #42 status changed');
      expect(notificationFor(prEvent({ change: 'checks_changed' }))?.title).toBe('PR #42 checks updated');
      expect(notificationFor(prEvent({ change: 'closed' }))?.title).toBe('PR #42 closed');
    });

    it('marks a merge as success and everything else as info', () => {
      expect(notificationFor(prEvent({ change: 'merged' }))?.severity).toBe('success');
      expect(notificationFor(prEvent({ change: 'status_changed' }))?.severity).toBe('info');
    });

    it('links to the session when present, otherwise to the PR', () => {
      expect(notificationFor(prEvent({ sessionId: 'sess-9' }))?.link).toEqual({
        kind: 'session',
        id: 'sess-9',
      });
      expect(notificationFor(prEvent({ sessionId: undefined }))?.link).toEqual({
        kind: 'pr',
        id: 'repo-1#42',
      });
    });

    it('passes the summary through as the body', () => {
      expect(notificationFor(prEvent({ summary: 'PR #42 merged' }))?.body).toBe('PR #42 merged');
    });
  });

  describe('ticket_changed', () => {
    it('titles each change with the external key', () => {
      expect(notificationFor(ticketEvent({ change: 'status_changed' }))?.title).toBe(
        'ENG-1234 status changed',
      );
      expect(notificationFor(ticketEvent({ change: 'new_comment' }))?.title).toBe(
        'New comment on ENG-1234',
      );
      expect(notificationFor(ticketEvent({ change: 'closed' }))?.title).toBe('ENG-1234 closed');
    });

    it('links to the plan item when linked, otherwise to the external key', () => {
      expect(notificationFor(ticketEvent({ planItemId: 'item-3' }))?.link).toEqual({
        kind: 'plan_item',
        id: 'item-3',
      });
      expect(notificationFor(ticketEvent({ planItemId: undefined }))?.link).toEqual({
        kind: 'external',
        id: 'ENG-1234',
      });
    });
  });

  describe('generic_update and loop_finding', () => {
    it('uses the summary as a generic update title', () => {
      const n = notificationFor(genericEvent({ summary: 'Cache warmed' }));
      expect(n).toMatchObject({ severity: 'info', title: 'Cache warmed' });
      expect(n?.link).toBeUndefined();
    });

    it('uses the loop finding title and body', () => {
      expect(notificationFor(loopEvent())).toMatchObject({
        severity: 'info',
        title: 'Found a flaky test',
        body: 'auth.spec.ts fails intermittently',
      });
    });
  });

  it('suppresses branch changes (observability-only)', () => {
    expect(notificationFor(branchEvent())).toBeNull();
  });
});

describe('dedupeKeyFor', () => {
  it('is stable across identical events and distinct across differing ones', () => {
    expect(dedupeKeyFor(prEvent({ change: 'merged' }))).toBe('pr:repo-1:42:merged');
    expect(dedupeKeyFor(prEvent({ change: 'merged' }))).toBe(
      dedupeKeyFor(prEvent({ change: 'merged', summary: 'different summary' })),
    );
    expect(dedupeKeyFor(prEvent({ change: 'closed' }))).not.toBe(dedupeKeyFor(prEvent({ change: 'merged' })));
  });

  it('keys other kinds by their identifying fields', () => {
    expect(dedupeKeyFor(ticketEvent())).toBe('ticket:linear:ENG-1234:status_changed');
    expect(dedupeKeyFor(branchEvent({ branch: null }))).toBe('branch:repo-1:null');
    expect(dedupeKeyFor(loopEvent())).toBe('loop:loop-1:Found a flaky test');
  });
});

describe('createNotificationService', () => {
  let broadcastToWindows: ReturnType<typeof vi.fn<(channel: string, payload: unknown) => void>>;
  let handler: ((event: never) => void) | null;
  let bus: UpdateEventBus;

  beforeEach(() => {
    vi.useFakeTimers();
    broadcastToWindows = vi.fn<(channel: string, payload: unknown) => void>();
    handler = null;
    bus = {
      onAny: vi.fn((listener) => {
        handler = listener;
        return () => {
          handler = null;
        };
      }),
      on: vi.fn(),
      emit: vi.fn(),
      listenerCount: vi.fn(() => (handler ? 1 : 0)),
      clear: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function fire(event: unknown) {
    handler?.(event as never);
  }

  it('broadcasts a mapped notification for events that notify', () => {
    const service = createNotificationService({ bus, broadcastToWindows });
    service.start();

    fire(loopEvent());

    expect(broadcastToWindows).toHaveBeenCalledTimes(1);
    expect(broadcastToWindows).toHaveBeenCalledWith(
      'notification:new',
      expect.objectContaining({ title: 'Found a flaky test', eventKind: 'loop_finding' }),
    );
  });

  it('does not broadcast observability-only events', () => {
    const service = createNotificationService({ bus, broadcastToWindows });
    service.start();

    fire(branchEvent());

    expect(broadcastToWindows).not.toHaveBeenCalled();
  });

  it('collapses identical events inside the dedupe window and lets them through after it', () => {
    const service = createNotificationService({ bus, broadcastToWindows, dedupeWindowMs: 1000 });
    service.start();

    fire(prEvent({ change: 'merged' }));
    fire(prEvent({ change: 'merged' }));
    expect(broadcastToWindows).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1001);
    fire(prEvent({ change: 'merged' }));
    expect(broadcastToWindows).toHaveBeenCalledTimes(2);
  });

  it('does not let a suppressed event consume a later notifying event of a different kind', () => {
    const service = createNotificationService({ bus, broadcastToWindows });
    service.start();

    fire(branchEvent());
    fire(loopEvent());

    expect(broadcastToWindows).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on stop', () => {
    const service = createNotificationService({ bus, broadcastToWindows });
    service.start();
    service.stop();

    fire(loopEvent());

    expect(broadcastToWindows).not.toHaveBeenCalled();
  });
});
