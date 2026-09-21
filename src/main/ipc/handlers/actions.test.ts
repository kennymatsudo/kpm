import { describe, expect, it, vi } from 'vitest';
import { buildActionHandlers } from './actions';
import type { ActionDefinition } from '../../../shared/actions';

const action = { id: 'action-1', name: 'Digest' } as ActionDefinition;

function handlers(overrides: {
  listForProject?: () => ActionDefinition[];
  get?: () => ActionDefinition | undefined;
  listByAction?: () => never[];
}) {
  const actions = {
    listForProject: vi.fn(overrides.listForProject ?? (() => [action])),
    get: vi.fn(overrides.get ?? (() => action)),
  } as never;
  const actionRuns = { listByAction: vi.fn(overrides.listByAction ?? (() => [])) } as never;
  return {
    built: buildActionHandlers({} as never, actions, actionRuns),
    actions: actions as unknown as { listForProject: ReturnType<typeof vi.fn> },
    actionRuns: actionRuns as unknown as { listByAction: ReturnType<typeof vi.fn> },
  };
}

describe('action IPC handlers', () => {
  it('reads the list straight from the repository', async () => {
    const { built, actions } = handlers({});
    const projectId = '11111111-1111-4111-8111-111111111111';

    const result = await built.list({ projectId }, {} as never);

    expect(result).toEqual({ actions: [action] });
    expect(actions.listForProject).toHaveBeenCalledWith(projectId);
  });

  it('reports a missing action rather than returning undefined', async () => {
    const { built } = handlers({ get: () => undefined });

    await expect(built.get({ id: 'gone' }, {} as never)).rejects.toThrow('Action not found: gone');
  });

  it('passes the history limit through to the repository and wraps the runs', async () => {
    const { built, actionRuns } = handlers({});

    const result = await built.history({ actionId: 'action-1', limit: 5 }, {} as never);

    expect(result).toEqual({ runs: [] });
    expect(actionRuns.listByAction).toHaveBeenCalledWith('action-1', 5);
  });

  it('surfaces the action service error instead of returning a malformed action', async () => {
    const actionService = { create: vi.fn(() => ({ ok: false, error: 'Name already in use' })) } as never;
    const built = buildActionHandlers(actionService, {} as never, {} as never);

    await expect(built.create({ name: 'Digest' } as never, {} as never)).rejects.toThrow(
      'Name already in use'
    );
  });
});
