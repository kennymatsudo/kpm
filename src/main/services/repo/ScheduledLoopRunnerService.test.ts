import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScheduledLoop, LoopRun } from '../../../shared/types';

const runClaudeQueryMock = vi.hoisted(() => vi.fn());

vi.mock('../../claude/runClaudeQuery', () => ({
  runClaudeQuery: runClaudeQueryMock,
}));

vi.mock('../../claude/sdkOptionsBuilder', () => ({
  buildSdkOptions: () => ({ mocked: true }),
}));

vi.mock('../../claude/contextBuilders', () => ({
  createContextBuilder: () => (projectId: string) => ({ project: { id: projectId } }),
}));

vi.mock('../../kpmTools/runtimeRegistry', () => ({
  runWithToolExecutionContext: (_context: unknown, run: () => unknown) => run(),
  subscribeToKpmToolProposals: () => () => {},
}));

import { createScheduledLoopRunnerService } from './ScheduledLoopRunnerService';

function makeLoop(overrides: Partial<ScheduledLoop> = {}): ScheduledLoop {
  return {
    id: 'loop-1',
    project_id: 'proj-1',
    name: 'Test loop',
    prompt: 'Check for interesting changes',
    output_mode: 'notify',
    interval_minutes: 30,
    enabled: true,
    last_run_at: null,
    last_outcome: null,
    last_error: null,
    memory: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRun(overrides: Partial<LoopRun> = {}): LoopRun {
  return {
    id: 'run-1',
    loop_id: 'loop-1',
    outcome: 'ok',
    summary: 'Found something',
    detail: null,
    error: null,
    artifact_path: null,
    started_at: '2026-01-01T00:00:00.000Z',
    finished_at: '2026-01-01T00:01:00.000Z',
    ...overrides,
  };
}

function buildHarness(loop: ScheduledLoop, runHistory: LoopRun[] = []) {
  const scheduledLoops = {
    get: vi.fn().mockReturnValue(loop),
    getAllEnabled: vi.fn().mockReturnValue([]),
    listByProject: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    recordRunOutcome: vi.fn(),
    updateMemory: vi.fn(),
  };
  const loopRuns = {
    create: vi.fn(),
    listByLoop: vi.fn().mockReturnValue(runHistory),
    pruneOld: vi.fn(),
  };
  const registeredHandlers = new Map<string, () => Promise<unknown>>();
  const scheduler = {
    register: vi.fn((registration: { id: string; handler: () => Promise<unknown> }) => {
      registeredHandlers.set(registration.id, registration.handler);
    }),
    unregister: vi.fn(),
    start: vi.fn(),
  };
  const eventBus = { emit: vi.fn() };
  const broadcastToWindows = vi.fn();

  const service = createScheduledLoopRunnerService({
    scheduledLoops,
    loopRuns,
    projects: { get: vi.fn().mockReturnValue({ id: loop.project_id, folder_path: '/tmp/project' }) },
    repos: {},
    attachments: {},
    planItems: {},
    taskPromptTemplates: {},
    scheduler,
    eventBus,
    mcpDiscoveryService: {
      getEnabledPluginPaths: () => ({ ok: true, data: [] }),
      getEnabledUserMcpConfigs: () => ({ ok: true, data: {} }),
      getCachedManagedServers: () => ({ ok: false, error: 'unused' }),
      getDisabledMcpTools: () => ({ ok: true, data: [] }),
      getDisabledMcpServerNames: () => ({ ok: true, data: [] }),
    },
    getMainWindow: () => null,
    broadcastToWindows,
  } as never);

  service.syncLoop(loop);
  const runTick = registeredHandlers.get(`loop:${loop.id}`);
  if (!runTick) throw new Error('runTick handler was not registered');

  return { scheduledLoops, loopRuns, eventBus, broadcastToWindows, runTick };
}

describe('ScheduledLoopRunnerService memory', () => {
  beforeEach(() => {
    runClaudeQueryMock.mockReset();
  });

  it('injects a known-state block with memory and recent runs into the prompt', async () => {
    const loop = makeLoop({ memory: 'Loop remembers X.' });
    const runHistory = [
      makeRun({ outcome: 'ok', summary: 'Found A', started_at: '2026-01-01T00:00:00.000Z' }),
      makeRun({ outcome: 'error', summary: 'should be skipped' }),
    ];
    const { loopRuns, runTick } = buildHarness(loop, runHistory);
    runClaudeQueryMock.mockResolvedValueOnce({ text: 'NO_FINDINGS: nothing new', errors: [] });

    await runTick();

    expect(loopRuns.listByLoop).toHaveBeenCalledWith(loop.id, 5);
    const prompt = runClaudeQueryMock.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('## Already known from previous runs');
    expect(prompt).toContain('Loop remembers X.');
    expect(prompt).toContain('Recent runs:');
    expect(prompt).toContain('- 2026-01-01T00:00:00.000Z [ok] Found A');
    expect(prompt).not.toContain('should be skipped');
  });

  it('omits the known-state block when there is no memory and no usable prior runs', async () => {
    const loop = makeLoop({ memory: null });
    const { loopRuns, runTick } = buildHarness(loop, []);
    runClaudeQueryMock.mockResolvedValueOnce({ text: 'NO_FINDINGS: nothing new', errors: [] });

    await runTick();

    expect(loopRuns.listByLoop).toHaveBeenCalledWith(loop.id, 10);
    const prompt = runClaudeQueryMock.mock.calls[0][0].prompt as string;
    expect(prompt).not.toContain('## Already known from previous runs');
  });

  it('parses the memory footer, strips it from the stored summary/detail and emitted finding, and persists it', async () => {
    const loop = makeLoop();
    const { scheduledLoops, loopRuns, eventBus, runTick } = buildHarness(loop);
    runClaudeQueryMock.mockResolvedValueOnce({
      text: 'Title line\nBody line\n\n===LOOP MEMORY===\nItem A watched, still open.',
      errors: [],
    });

    await runTick();

    expect(loopRuns.create).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'ok', summary: 'Title line', detail: 'Body line' }),
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Title line', body: 'Body line' }),
    );
    expect(scheduledLoops.updateMemory).toHaveBeenCalledWith(loop.id, 'Item A watched, still open.');
  });

  it('leaves memory unchanged when the reply has no memory delimiter', async () => {
    const loop = makeLoop();
    const { scheduledLoops, runTick } = buildHarness(loop);
    runClaudeQueryMock.mockResolvedValueOnce({ text: 'A fresh finding.\nSome detail.', errors: [] });

    await runTick();

    expect(scheduledLoops.updateMemory).not.toHaveBeenCalled();
  });

  it('treats NO_FINDINGS followed by a memory block as a no_op that still persists memory', async () => {
    const loop = makeLoop();
    const { scheduledLoops, loopRuns, runTick } = buildHarness(loop);
    runClaudeQueryMock.mockResolvedValueOnce({
      text: 'NO_FINDINGS: nothing changed\n\n===LOOP MEMORY===\nStill watching item A.',
      errors: [],
    });

    await runTick();

    expect(loopRuns.create).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'no_op', summary: 'nothing changed' }),
    );
    expect(scheduledLoops.updateMemory).toHaveBeenCalledWith(loop.id, 'Still watching item A.');
  });

  it('does not persist memory when the run errors', async () => {
    const loop = makeLoop();
    const { scheduledLoops, loopRuns, runTick } = buildHarness(loop);
    runClaudeQueryMock.mockRejectedValueOnce(new Error('network down'));

    await runTick();

    expect(loopRuns.create).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'error', error: 'network down' }),
    );
    expect(scheduledLoops.updateMemory).not.toHaveBeenCalled();
  });
});
