import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionDefinition } from '../../../shared/actions';

const mocks = vi.hoisted(() => ({
  runClaudeQuery: vi.fn<(options: unknown) => Promise<{ text: string }>>(),
  buildSdkOptions: vi.fn<(params: { grantedCapabilities?: string[] }) => object>(),
}));
const { runClaudeQuery, buildSdkOptions } = mocks;

vi.mock('../../claude/runClaudeQuery', () => ({ runClaudeQuery: mocks.runClaudeQuery }));
vi.mock('../../claude/sdkOptionsBuilder', () => ({ buildSdkOptions: mocks.buildSdkOptions }));
vi.mock('../../claude/contextBuilders', () => ({
  createContextBuilder: () => () => ({ project: { id: 'p1', folder_path: '/tmp/p1' }, repos: [] }),
}));
vi.mock('../../kpmTools/runtimeRegistry', () => ({
  runWithToolExecutionContext: (_context: unknown, fn: () => unknown) => fn(),
}));

import { createActionRunnerService } from './ActionRunnerService';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function action(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id: 'a1',
    name: 'Watcher',
    description: '',
    projectId: PROJECT_ID,
    prompt: 'Look for problems.',
    icon: 'document',
    keywords: '',
    trigger: { kind: 'interval', minutes: 60 },
    enabled: true,
    capabilities: ['read_project', 'report_finding'],
    manualRun: 'headless',
    targetType: 'none',
    model: null,
    memory: null,
    lastRunAt: null,
    lastOutcome: null,
    lastError: null,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

function harness(stored: ActionDefinition = action()) {
  const actions = {
    get: vi.fn(() => stored),
    listForProject: vi.fn(() => []),
    listEnabledIntervalTriggered: vi.fn(() => []),
    listEnabledForEvent: vi.fn(() => []),
    nameExists: vi.fn(() => false),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    recordRunOutcome: vi.fn(),
    updateMemory: vi.fn(),
  };
  const actionRuns = { create: vi.fn(), listByAction: vi.fn(() => []), pruneOld: vi.fn() };
  const scheduler = { register: vi.fn(), unregister: vi.fn(), start: vi.fn() };
  const eventBus = { emit: vi.fn(), onAny: vi.fn(), on: vi.fn() };
  const broadcastToWindows = vi.fn();

  const runner = createActionRunnerService({
    actions,
    actionRuns,
    projects: { get: () => ({ id: PROJECT_ID, folder_path: '/tmp/p1' }) } as never,
    repos: {} as never,
    attachments: {} as never,
    planItems: {} as never,
    taskPromptTemplates: {} as never,
    scheduler: scheduler as never,
    eventBus: eventBus as never,
    mcpDiscoveryService: {
      getEnabledPluginPaths: () => ({ ok: true, data: [] }),
      getEnabledUserMcpConfigs: () => ({ ok: true, data: {} }),
      getCachedManagedServers: () => ({ ok: false }),
    } as never,
    getDefaultClaudeModel: () => 'sonnet',
    getFallbackProjectId: () => null,
    getMainWindow: () => null,
    broadcastToWindows,
  });

  return { runner, actions, actionRuns, scheduler, eventBus, broadcastToWindows };
}

beforeEach(() => {
  runClaudeQuery.mockReset();
  buildSdkOptions.mockClear();
  buildSdkOptions.mockReturnValue({});
});

describe('ActionRunnerService', () => {
  it('passes only the granted tool capabilities to the SDK', async () => {
    runClaudeQuery.mockResolvedValue({ text: 'Something broke\nDetails here.' });
    const { runner } = harness();

    await runner.runNow('a1');
    await vi.waitFor(() => expect(buildSdkOptions).toHaveBeenCalled());

    const granted = buildSdkOptions.mock.calls[0]?.[0].grantedCapabilities ?? [];
    expect(granted).toContain('plan_items.read');
    expect(granted).not.toContain('plan_items.propose');
    expect(granted).not.toContain('documents.propose');
  });

  it('records a finding and broadcasts the run', async () => {
    runClaudeQuery.mockResolvedValue({ text: 'Build is red\nThe main branch fails to compile.' });
    const { runner, actionRuns, eventBus, broadcastToWindows } = harness();

    await runner.runNow('a1');
    await vi.waitFor(() => expect(actionRuns.create).toHaveBeenCalled());

    expect(eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Build is red' }));
    expect(actionRuns.create).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'ok', summary: 'Build is red' }));
    expect(broadcastToWindows).toHaveBeenCalledWith('action:run', expect.objectContaining({ outcome: 'ok' }));
  });

  it('treats the no-findings sentinel as a silent no-op', async () => {
    runClaudeQuery.mockResolvedValue({ text: 'NO_FINDINGS: nothing changed since yesterday' });
    const { runner, actionRuns, eventBus } = harness();

    await runner.runNow('a1');
    await vi.waitFor(() => expect(actionRuns.create).toHaveBeenCalled());

    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(actionRuns.create).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'no_op', summary: 'nothing changed since yesterday' })
    );
  });

  it('carries memory forward on a successful run but not a failed one', async () => {
    runClaudeQuery.mockResolvedValue({ text: 'Found it\n===ACTION MEMORY===\nseen build 41' });
    const { runner, actions } = harness();

    await runner.runNow('a1');
    await vi.waitFor(() => expect(actions.updateMemory).toHaveBeenCalledWith('a1', 'seen build 41'));

    actions.updateMemory.mockClear();
    runClaudeQuery.mockRejectedValue(new Error('timed out'));
    await runner.runNow('a1');
    await vi.waitFor(() => expect(actions.recordRunOutcome).toHaveBeenCalledWith('a1', 'error', 'timed out', expect.any(String)));
    expect(actions.updateMemory).not.toHaveBeenCalled();
  });

  it('registers only enabled interval triggers with the scheduler', () => {
    const { runner, scheduler } = harness();

    runner.syncAction(action({ trigger: { kind: 'interval', minutes: 30 } }));
    expect(scheduler.register).toHaveBeenCalledWith(expect.objectContaining({ intervalMs: 1_800_000 }));

    scheduler.register.mockClear();
    runner.syncAction(action({ enabled: false }));
    runner.syncAction(action({ trigger: { kind: 'manual' } }));
    runner.syncAction(action({ trigger: { kind: 'event', event: 'pr_changed' } }));
    expect(scheduler.register).not.toHaveBeenCalled();
  });

  it('skips a chat-mode action, which belongs in a chat session', async () => {
    const { runner, actionRuns } = harness(
      action({ manualRun: 'chat', trigger: { kind: 'manual' }, capabilities: ['read_project'] })
    );

    await runner.runNow('a1');
    expect(actionRuns.create).not.toHaveBeenCalled();
  });

  it('skips a global action when no project can be resolved', async () => {
    const { runner, actionRuns } = harness(action({ projectId: null }));

    await runner.runNow('a1');
    expect(actionRuns.create).not.toHaveBeenCalled();
  });

  it('writes an output file when that grant is present', async () => {
    runClaudeQuery.mockResolvedValue({ text: '## Weekly digest\n\nAll quiet.' });
    const { runner, actionRuns } = harness(
      action({ capabilities: ['read_project', 'write_outputs'] })
    );

    await runner.runNow('a1');
    await vi.waitFor(() => expect(actionRuns.create).toHaveBeenCalled());

    expect(actionRuns.create).toHaveBeenCalledWith(
      expect.objectContaining({ artifactPath: expect.stringContaining('outputs/actions/watcher.md') })
    );
  });
});
