import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentSessionManager } from './AgentSessionManager';

const codexMocks = vi.hoisted(() => ({
  runStreamed: vi.fn(),
  startThread: vi.fn(),
}));

vi.mock('@openai/codex-sdk', () => ({
  Codex: vi.fn(function Codex() {
    return {
      startThread: codexMocks.startThread,
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

function createManager() {
  return createAgentSessionManager({ getMainWindow: () => null });
}

describe('AgentSessionManager.isSessionBusy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    codexMocks.startThread.mockReturnValue({
      runStreamed: codexMocks.runStreamed,
    });
  });

  it('is false when no session is registered for the dev session id', () => {
    const manager = createManager();
    expect(manager.isSessionBusy('unknown-dev-session')).toBe(false);
  });

  it('is true while the session is starting/working, and false once it completes', async () => {
    let resolveRun!: (value: { events: AsyncGenerator<unknown> }) => void;
    codexMocks.runStreamed.mockReturnValue(
      new Promise((resolve) => {
        resolveRun = resolve;
      }),
    );

    const manager = createManager();
    const session = manager.create({
      devSessionId: 'dev-session-1',
      projectId: 'project-1',
      agentType: 'codex',
      role: 'implement',
    });

    expect(manager.isSessionBusy('dev-session-1')).toBe(true);

    await session.start('/tmp/worktree', 'do the task');
    expect(manager.isSessionBusy('dev-session-1')).toBe(true);

    resolveRun({ events: streamEvents([{ type: 'turn.completed', usage: null }]) });
    await vi.waitFor(() => {
      expect(manager.isSessionBusy('dev-session-1')).toBe(false);
    });
  });
});
