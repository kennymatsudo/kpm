import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildSnapshot, createActivityService } from './ActivityService';
import { activityEvents } from '../../../shared/ipc/activityEvents';

function deps(overrides: {
  chat?: Map<string, number>;
  agents?: Map<string, { working: number; awaitingInput: number }>;
  terminals?: Map<string, number>;
} = {}) {
  return {
    chatTurnsByProject: () => overrides.chat ?? new Map<string, number>(),
    agentsByProject: () => overrides.agents ?? new Map<string, { working: number; awaitingInput: number }>(),
    terminalsByProject: () => overrides.terminals ?? new Map<string, number>(),
  };
}

describe('buildSnapshot', () => {
  it('merges the three sources into one row per project', () => {
    const snapshot = buildSnapshot(
      deps({
        chat: new Map([['p1', 1]]),
        agents: new Map([['p1', { working: 2, awaitingInput: 1 }]]),
        terminals: new Map([['p1', 3]]),
      })
    );

    expect(snapshot).toEqual([
      { projectId: 'p1', chatTurns: 1, agentsWorking: 2, agentsAwaitingInput: 1, terminals: 3 },
    ]);
  });

  it('includes a project present in only one source', () => {
    const snapshot = buildSnapshot(deps({ terminals: new Map([['p2', 1]]) }));

    expect(snapshot).toEqual([
      { projectId: 'p2', chatTurns: 0, agentsWorking: 0, agentsAwaitingInput: 0, terminals: 1 },
    ]);
  });

  it('is empty when nothing is running anywhere', () => {
    expect(buildSnapshot(deps())).toEqual([]);
  });
});

describe('createActivityService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('broadcasts once when the counts change and stays quiet while they hold', () => {
    const broadcastToWindows = vi.fn();
    let chatTurns = new Map<string, number>();

    const service = createActivityService({
      chatTurnsByProject: () => chatTurns,
      agentsByProject: () => new Map(),
      terminalsByProject: () => new Map(),
      broadcastToWindows,
      sampleIntervalMs: 10,
    });

    service.start();

    chatTurns = new Map([['p1', 1]]);
    vi.advanceTimersByTime(10);
    expect(broadcastToWindows).toHaveBeenCalledTimes(1);
    expect(broadcastToWindows).toHaveBeenCalledWith(activityEvents.changed.channel, [
      { projectId: 'p1', chatTurns: 1, agentsWorking: 0, agentsAwaitingInput: 0, terminals: 0 },
    ]);

    // Same counts on the next few samples — nothing new to say.
    vi.advanceTimersByTime(50);
    expect(broadcastToWindows).toHaveBeenCalledTimes(1);

    chatTurns = new Map();
    vi.advanceTimersByTime(10);
    expect(broadcastToWindows).toHaveBeenCalledTimes(2);
    expect(broadcastToWindows).toHaveBeenLastCalledWith(activityEvents.changed.channel, []);

    service.stop();
  });

  it('stops sampling once stopped', () => {
    const broadcastToWindows = vi.fn();
    let terminals = new Map<string, number>();

    const service = createActivityService({
      chatTurnsByProject: () => new Map(),
      agentsByProject: () => new Map(),
      terminalsByProject: () => terminals,
      broadcastToWindows,
      sampleIntervalMs: 10,
    });

    service.start();
    service.stop();

    terminals = new Map([['p1', 1]]);
    vi.advanceTimersByTime(100);
    expect(broadcastToWindows).not.toHaveBeenCalled();
  });
});
