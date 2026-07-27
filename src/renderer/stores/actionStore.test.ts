import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionDefinition } from '../../shared/actions';

const mocks = vi.hoisted(() => ({
  listActions: vi.fn(),
  createAction: vi.fn(),
  updateAction: vi.fn(),
  setActionEnabled: vi.fn(),
  deleteAction: vi.fn(),
  runActionNow: vi.fn(),
  getActionHistory: vi.fn(),
}));

vi.mock('../services/actionService', () => mocks);

import { useActionStore } from './actionStore';

function action(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id: 'a1',
    name: 'Digest',
    description: '',
    projectId: null,
    prompt: 'Summarize.',
    icon: 'document',
    keywords: '',
    trigger: { kind: 'manual' },
    enabled: false,
    capabilities: ['read_project'],
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

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getActionHistory.mockResolvedValue({ success: true, data: [] });
  useActionStore.getState().reset();
});

describe('useActionStore', () => {
  it('surfaces a load failure as an error rather than an empty list', async () => {
    mocks.listActions.mockResolvedValue({ success: false, error: 'nope' });

    await useActionStore.getState().loadActions('p1');

    expect(useActionStore.getState().error).toBe('nope');
    expect(useActionStore.getState().isLoading).toBe(false);
  });

  it('ignores a stale load that resolves after a newer one', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    mocks.listActions
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ success: true, data: [action({ name: 'Second' })] });

    const first = useActionStore.getState().loadActions('p1');
    const second = useActionStore.getState().loadActions('p2');
    await second;
    resolveFirst({ success: true, data: [action({ name: 'First' })] });
    await first;

    expect(useActionStore.getState().actions.map((entry) => entry.name)).toEqual(['Second']);
  });

  it('prepends a created action and selects it', async () => {
    mocks.createAction.mockResolvedValue({ success: true, data: action({ id: 'new' }) });
    useActionStore.setState({ actions: [action({ id: 'old' })] });

    await useActionStore.getState().create(action());

    expect(useActionStore.getState().actions.map((entry) => entry.id)).toEqual(['new', 'old']);
    expect(useActionStore.getState().selectedActionId).toBe('new');
  });

  it('replaces the updated row in place', async () => {
    mocks.updateAction.mockResolvedValue({ success: true, data: action({ name: 'Renamed' }) });
    useActionStore.setState({ actions: [action(), action({ id: 'a2', name: 'Other' })] });

    const ok = await useActionStore.getState().update('a1', { name: 'Renamed' });

    expect(ok).toBe(true);
    expect(useActionStore.getState().actions.map((entry) => entry.name)).toEqual(['Renamed', 'Other']);
  });

  it('leaves the list untouched when a save fails', async () => {
    mocks.updateAction.mockResolvedValue({ success: false, error: 'name taken' });
    useActionStore.setState({ actions: [action()] });

    const ok = await useActionStore.getState().update('a1', { name: 'Clash' });

    expect(ok).toBe(false);
    expect(useActionStore.getState().actions[0]?.name).toBe('Digest');
    expect(useActionStore.getState().error).toBe('name taken');
  });

  it('clears the selection when the selected action is deleted', async () => {
    mocks.deleteAction.mockResolvedValue({ success: true });
    useActionStore.setState({ actions: [action()], selectedActionId: 'a1' });

    await useActionStore.getState().remove('a1');

    expect(useActionStore.getState().actions).toEqual([]);
    expect(useActionStore.getState().selectedActionId).toBeNull();
  });

  it('loads history for a newly selected action', async () => {
    useActionStore.getState().selectAction('a1');

    expect(mocks.getActionHistory).toHaveBeenCalledWith('a1', 20);
  });
});
