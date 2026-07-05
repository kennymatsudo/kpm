import { describe, it, expect } from 'vitest';
import {
  interpretSdkMessage,
  type InterpretedChatEvent,
  type SdkMessageSessionView,
} from './interpretSdkMessage';
import type { Activity } from '../../../shared/types';

function makeView(overrides: Partial<SdkMessageSessionView> = {}): SdkMessageSessionView {
  return {
    segmentState: { currentSegmentId: 0, hasTextInCurrentSegment: false, pendingActivities: [] },
    toolUseActivities: new Map<string, Activity>(),
    accumulatedResponse: '',
    interruptInProgress: false,
    pendingFollowUpClientMessageIds: [],
    acceptedFollowUpClientMessageIds: [],
    promotedFollowUpClientMessageIds: new Set<string>(),
    ...overrides,
  };
}

const DEFAULT_OPTIONS = { streamPartialsEnabled: false, now: 1_000_000 };

function interpret(msg: unknown, view: SdkMessageSessionView, options = DEFAULT_OPTIONS): InterpretedChatEvent[] {
  return interpretSdkMessage(msg, view, options);
}

function partialDelta(text: string, parentToolUseId: string | null = null) {
  return {
    type: 'stream_event',
    parent_tool_use_id: parentToolUseId,
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  };
}

describe('partial assistant deltas', () => {
  it('emits a chunk with the current segment id', () => {
    const view = makeView();
    view.segmentState.currentSegmentId = 3;

    const events = interpret(partialDelta('hello'), view);

    expect(events).toEqual([{ kind: 'chunk', text: 'hello', segmentId: 3, precedingActivities: undefined }]);
  });

  it('drains pending activities as the segment boundary before the first token', () => {
    const view = makeView();
    const activity = { id: 'a1', type: 'other', label: 'Reading' } as Activity;
    view.segmentState.pendingActivities.push(activity);

    const events = interpret(partialDelta('x'), view);

    expect(events).toEqual([
      { kind: 'chunk', text: 'x', segmentId: 0, precedingActivities: [activity] },
    ]);
    expect(view.segmentState.pendingActivities).toEqual([]);
  });

  it('ignores subagent deltas and deltas during interrupt-and-send', () => {
    expect(interpret(partialDelta('x', 'parent-1'), makeView())).toEqual([]);
    expect(interpret(partialDelta('x'), makeView({ interruptInProgress: true }))).toEqual([]);
  });
});

describe('assistant messages', () => {
  it('accumulates text and emits a chunk when partial streaming is off', () => {
    const view = makeView();
    const events = interpret(
      { type: 'assistant', message: { content: [{ type: 'text', text: 'answer' }] } },
      view,
    );

    expect(view.accumulatedResponse).toBe('answer');
    expect(view.segmentState.hasTextInCurrentSegment).toBe(true);
    expect(events).toEqual([
      { kind: 'chunk', text: 'answer', segmentId: 0, precedingActivities: undefined },
    ]);
  });

  it('accumulates without re-emitting when partial streaming is on', () => {
    const view = makeView();
    const events = interpret(
      { type: 'assistant', message: { content: [{ type: 'text', text: 'answer' }] } },
      view,
      { streamPartialsEnabled: true, now: 0 },
    );

    expect(view.accumulatedResponse).toBe('answer');
    expect(events).toEqual([]);
  });

  it('suppresses the chunk during interrupt-and-send but still accumulates and clears pending activities', () => {
    const view = makeView({ interruptInProgress: true });
    view.segmentState.pendingActivities.push({ id: 'a1', type: 'other', label: 'x' });

    const events = interpret(
      { type: 'assistant', message: { content: [{ type: 'text', text: 'late' }] } },
      view,
    );

    expect(view.accumulatedResponse).toBe('late');
    expect(view.segmentState.pendingActivities).toEqual([]);
    expect(events).toEqual([]);
  });

  it('captures the SDK-resolved model from main-turn messages only', () => {
    const view = makeView();
    interpret({ type: 'assistant', message: { model: 'claude-opus-4-8', content: [] } }, view);
    expect(view.resolvedModel).toBe('claude-opus-4-8');

    const subagentView = makeView();
    interpret(
      { type: 'assistant', parent_tool_use_id: 'p1', message: { model: 'claude-sonnet-5', content: [] } },
      subagentView,
    );
    expect(subagentView.resolvedModel).toBeUndefined();
  });

  it('surfaces a turn-aborting assistant error and marks it surfaced', () => {
    const view = makeView();
    const events = interpret(
      { type: 'assistant', error: 'overloaded', message: { content: [] } },
      view,
    );

    expect(view.turnErrorSurfaced).toBe(true);
    expect(events).toEqual([
      { kind: 'error', error: expect.stringContaining('temporarily overloaded') },
    ]);
  });

  it('starts a new segment when a tool_use follows text, queues and emits its activity, and logs the call', () => {
    const view = makeView();
    view.segmentState.hasTextInCurrentSegment = true;

    const events = interpret(
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/tmp/a.ts' } },
          ],
        },
      },
      view,
    );

    expect(view.segmentState.currentSegmentId).toBe(1);
    expect(view.segmentState.hasTextInCurrentSegment).toBe(false);
    expect(view.segmentState.pendingActivities).toHaveLength(1);
    expect(view.toolUseActivities.get('tool-1')).toBeDefined();
    expect(events).toEqual([
      { kind: 'activity', activity: view.segmentState.pendingActivities[0] },
      expect.objectContaining({ kind: 'tool-call-log', toolName: 'Read', input: { file_path: '/tmp/a.ts' } }),
    ]);
  });

  it('still tracks tool_use state during interrupt-and-send but does not emit the activity', () => {
    const view = makeView({ interruptInProgress: true });

    const events = interpret(
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/tmp/a.ts' } }],
        },
      },
      view,
    );

    expect(view.toolUseActivities.has('tool-1')).toBe(true);
    expect(view.segmentState.pendingActivities).toHaveLength(1);
    expect(events).toEqual([expect.objectContaining({ kind: 'tool-call-log' })]);
  });

  it('emits thinking blocks unless interrupted', () => {
    expect(
      interpret({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'hmm' }] } }, makeView()),
    ).toEqual([{ kind: 'thinking', text: 'hmm' }]);
    expect(
      interpret(
        { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'hmm' }] } },
        makeView({ interruptInProgress: true }),
      ),
    ).toEqual([]);
  });

  it('rolls subagent text onto the parent activity card instead of the transcript', () => {
    const view = makeView();
    const parent = { id: 'act-1', type: 'other', label: 'Explore' } as Activity;
    view.toolUseActivities.set('parent-1', parent);

    const events = interpret(
      {
        type: 'assistant',
        parent_tool_use_id: 'parent-1',
        message: { content: [{ type: 'text', text: '  \nScanning src/main\nmore' }] },
      },
      view,
    );

    expect(view.accumulatedResponse).toBe('');
    expect(view.toolUseActivities.get('parent-1')).toEqual({ ...parent, detail: 'Scanning src/main' });
    expect(events).toEqual([
      { kind: 'activity', activity: { ...parent, detail: 'Scanning src/main' } },
    ]);
  });
});

describe('user message echoes', () => {
  it('clears the queued badge when the SDK dequeues a pending follow-up', () => {
    const view = makeView({ pendingFollowUpClientMessageIds: ['m1', 'm2'] });

    const events = interpret({ type: 'user' }, view);

    expect(events).toEqual([{ kind: 'queue-cleared', clientMessageId: 'm1', reason: 'already_sent' }]);
    expect(view.pendingFollowUpClientMessageIds).toEqual(['m2']);
    expect(view.acceptedFollowUpClientMessageIds).toEqual(['m1']);
  });

  it('does not treat a promoted follow-up echo as a live interjection', () => {
    const view = makeView({
      pendingFollowUpClientMessageIds: ['m1'],
      promotedFollowUpClientMessageIds: new Set(['m1']),
    });

    interpret({ type: 'user' }, view);

    expect(view.acceptedFollowUpClientMessageIds).toEqual([]);
    expect(view.promotedFollowUpClientMessageIds.has('m1')).toBe(false);
  });

  it('attaches diff stats from a tool_use_result to the original activity', () => {
    const view = makeView();
    view.toolUseActivities.set('tool-1', { id: 'act-1', type: 'edit', label: 'Edit' });

    const events = interpret(
      {
        type: 'user',
        tool_use_result: {
          structuredPatch: [{ lines: ['+added', '-removed', ' context'] }],
        },
        message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1' }] },
      },
      view,
    );

    expect(events).toEqual([
      {
        kind: 'activity',
        activity: expect.objectContaining({
          id: 'act-1',
          diffStats: { additions: 1, deletions: 1 },
        }),
      },
    ]);
    expect(view.toolUseActivities.get('tool-1')).toMatchObject({ diffStats: { additions: 1, deletions: 1 } });
  });
});

describe('progress, banners, and refusals', () => {
  it('surfaces a live timer for long-running tools but not fast ones', () => {
    const view = makeView();
    view.toolUseActivities.set('tool-1', { id: 'act-1', type: 'other', label: 'Bash' });

    expect(
      interpret({ type: 'tool_progress', tool_use_id: 'tool-1', tool_name: 'Bash', elapsed_time_seconds: 1.2 }, view),
    ).toEqual([]);

    expect(
      interpret({ type: 'tool_progress', tool_use_id: 'tool-1', tool_name: 'Bash', elapsed_time_seconds: 7.6 }, view),
    ).toEqual([
      { kind: 'activity', activity: expect.objectContaining({ id: 'act-1', elapsedSeconds: 8 }) },
    ]);
  });

  it('turns a continuation-preventing hook banner into a surfaced error', () => {
    const view = makeView();
    const events = interpret(
      { type: 'system', subtype: 'informational', content: 'Blocked by hook', level: 'warning', prevent_continuation: true },
      view,
    );

    expect(view.turnErrorSurfaced).toBe(true);
    expect(events).toEqual([{ kind: 'error', error: 'Blocked by hook' }]);
  });

  it('surfaces non-info banners as activities and drops transcript-only info', () => {
    expect(
      interpret({ type: 'system', subtype: 'informational', content: 'Careful', level: 'warning' }, makeView()),
    ).toEqual([
      { kind: 'activity', activity: expect.objectContaining({ label: 'Warning', detail: 'Careful' }) },
    ]);
    expect(
      interpret({ type: 'system', subtype: 'informational', content: 'FYI', level: 'info' }, makeView()),
    ).toEqual([]);
  });

  it('describes a model-refusal fallback as a notice and a no-fallback refusal as an error', () => {
    expect(
      interpret(
        { type: 'system', subtype: 'model_refusal_fallback', original_model: 'opus', fallback_model: 'sonnet' },
        makeView(),
      ),
    ).toEqual([
      { kind: 'activity', activity: expect.objectContaining({ label: 'Switched models' }) },
    ]);

    const view = makeView();
    expect(
      interpret({ type: 'system', subtype: 'model_refusal_no_fallback', content: 'Declined.' }, view),
    ).toEqual([{ kind: 'error', error: 'Declined.' }]);
    expect(view.turnErrorSurfaced).toBe(true);
  });

  it('reports API retries with a log line and an activity', () => {
    const events = interpret(
      { type: 'system', subtype: 'api_retry', attempt: 2, max_retries: 5, retry_delay_ms: 3000, error_status: 529 },
      makeView(),
    );

    expect(events).toEqual([
      { kind: 'log', message: expect.stringContaining('API retry 2/5') },
      { kind: 'activity', activity: expect.objectContaining({ label: 'Retrying' }) },
    ]);
  });
});

describe('rate limits', () => {
  it('reports a rejection with the reset time relative to now', () => {
    const events = interpret(
      {
        type: 'rate_limit_event',
        rate_limit_info: { status: 'rejected', resetsAt: 1_000_000 + 10 * 60_000 },
      },
      makeView(),
    );

    expect(events).toEqual([
      { kind: 'log', message: expect.stringContaining('rejected') },
      {
        kind: 'activity',
        activity: expect.objectContaining({ label: 'Rate Limited', detail: 'Rate limited — resets in 10m' }),
      },
    ]);
  });

  it('reports credit exhaustion distinctly from a timed rate limit', () => {
    const events = interpret(
      {
        type: 'rate_limit_event',
        rate_limit_info: { status: 'rejected', errorCode: 'credits_required', canUserPurchaseCredits: true },
      },
      makeView(),
    );

    expect(events[1]).toEqual({
      kind: 'activity',
      activity: expect.objectContaining({
        label: 'Out of Credits',
        detail: expect.stringContaining('purchase more'),
      }),
    });
  });

  it('ignores allowed statuses', () => {
    expect(
      interpret({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } }, makeView()),
    ).toEqual([]);
  });
});

describe('turn lifecycle', () => {
  it('defers result messages to the caller as turn-result', () => {
    expect(interpret({ type: 'result', subtype: 'success' }, makeView())).toEqual([{ kind: 'turn-result' }]);
  });

  it('emits compact-boundary notices', () => {
    expect(
      interpret({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual' } }, makeView()),
    ).toEqual([
      { kind: 'activity', activity: expect.objectContaining({ label: 'Context compacted' }) },
    ]);
  });

  it('forwards prompt suggestions', () => {
    expect(interpret({ type: 'prompt_suggestion', suggestion: 'Try X' }, makeView())).toEqual([
      { kind: 'suggestions', suggestions: ['Try X'] },
    ]);
  });
});
