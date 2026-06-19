import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentSessionManager } from './AgentSessionManager';
import type { AgentSessionManagerDeps } from './AgentSessionManager';

const codexMocks = vi.hoisted(() => ({
  runStreamed: vi.fn(),
  startThread: vi.fn(),
}));

vi.mock('@openai/codex-sdk', () => ({
  Codex: vi.fn(function Codex() {
    return {
    };
  }),
}));

vi.mock('../../codex/binary', () => ({
  findCodexBinaryPath: () => '/tmp/codex',
}));

async function* streamEvents(events: unknown[]) {
  for (const event of events) {
    yield event;
  }
}

async function waitFor(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < 100; i += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw lastError;
}

function createManager(overrides: Partial<AgentSessionManagerDeps> = {}) {
  return createAgentSessionManager({
    getMainWindow: () => null,
    ...overrides,
  });
}

  beforeEach(() => {
    vi.clearAllMocks();
    codexMocks.startThread.mockReturnValue({
      runStreamed: codexMocks.runStreamed,
    });
  });

  it('persists valid empty findings on SDK turn completion', async () => {
    codexMocks.runStreamed.mockResolvedValue({
      events: streamEvents([
        {
          type: 'item.completed',
          item: {
            id: 'msg-1',
            type: 'agent_message',
            text: '{"findings":[]}',
          },
        },
        { type: 'turn.completed', usage: null },
      ]),
    });

    const persistReviewStarted = vi.fn();
    const persistReviewResult = vi.fn();
    const persistReviewFailure = vi.fn();
    const onSessionComplete = vi.fn();
    const manager = createManager({
      persistReviewStarted,
      persistReviewResult,
      persistReviewFailure,
      onSessionComplete,
    });

    const session = manager.create({
      devSessionId: 'session-1-review',
      projectId: 'project-1',
      agentType: 'codex',
      role: 'review',
      model: 'gpt-test',
    });

    await session.start('/tmp', 'review prompt');

    await waitFor(() => {
      expect(onSessionComplete).toHaveBeenCalled();
    });

    expect(codexMocks.startThread).toHaveBeenCalledWith(expect.objectContaining({
      workingDirectory: '/tmp',
      sandboxMode: 'read-only',
      approvalPolicy: 'never',
      networkAccessEnabled: false,
      webSearchMode: 'disabled',
      model: 'gpt-test',
    }));
    expect(persistReviewStarted).toHaveBeenCalledWith({
      implementationSessionId: 'session-1',
      reviewSessionId: 'session-1-review',
      reviewerAgent: 'codex',
    });
    expect(persistReviewResult).toHaveBeenCalledWith({
      implementationSessionId: 'session-1',
      reviewSessionId: 'session-1-review',
      reviewerAgent: 'codex',
      findings: [],
      rawOutput: '{"findings":[]}',
    });
    expect(persistReviewFailure).not.toHaveBeenCalled();
    expect(onSessionComplete).toHaveBeenCalledWith(expect.objectContaining({
      role: 'review',
      findings: [],
      reviewError: undefined,
    }));
  });

  it('persists malformed SDK review output as a failed review', async () => {
    codexMocks.runStreamed.mockResolvedValue({
      events: streamEvents([
        {
          type: 'item.completed',
          item: {
            id: 'msg-1',
            type: 'agent_message',
            text: 'All done. Looks good.',
          },
        },
        { type: 'turn.completed', usage: null },
      ]),
    });

    const persistReviewResult = vi.fn();
    const persistReviewFailure = vi.fn();
    const onSessionComplete = vi.fn();
    const manager = createManager({
      persistReviewResult,
      persistReviewFailure,
      onSessionComplete,
    });

    const session = manager.create({
      devSessionId: 'session-2-review',
      projectId: 'project-1',
      agentType: 'codex',
      role: 'review',
    });

    await session.start('/tmp', 'review prompt');

    await waitFor(() => {
      expect(onSessionComplete).toHaveBeenCalled();
    });

    expect(persistReviewResult).not.toHaveBeenCalled();
    expect(persistReviewFailure).toHaveBeenCalledWith({
      implementationSessionId: 'session-2',
      reviewSessionId: 'session-2-review',
      reviewerAgent: 'codex',
      rawOutput: 'All done. Looks good.',
      error: 'Review agent returned output that did not match the required findings JSON schema',
    });
    expect(onSessionComplete).toHaveBeenCalledWith(expect.objectContaining({
      role: 'review',
      findings: undefined,
      reviewError: 'Review agent returned output that did not match the required findings JSON schema',
    }));
  });

  it('persists SDK turn failures as failed reviews without completion', async () => {
    codexMocks.runStreamed.mockResolvedValue({
      events: streamEvents([
        {
          type: 'turn.failed',
          error: { message: 'rate limit exceeded' },
        },
      ]),
    });

    const persistReviewFailure = vi.fn();
    const onSessionComplete = vi.fn();
    const manager = createManager({
      persistReviewFailure,
      onSessionComplete,
    });

    const session = manager.create({
      devSessionId: 'session-3-review',
      projectId: 'project-1',
      agentType: 'codex',
      role: 'review',
    });

    await session.start('/tmp', 'review prompt');

    await waitFor(() => {
      expect(persistReviewFailure).toHaveBeenCalled();
    });

    expect(session.state).toBe('failed');
    expect(onSessionComplete).not.toHaveBeenCalled();
    expect(persistReviewFailure).toHaveBeenCalledWith({
      implementationSessionId: 'session-3',
      reviewSessionId: 'session-3-review',
      reviewerAgent: 'codex',
      rawOutput: null,
      error: 'Rate limited. Please try again in a moment.',
    });
  });
});
