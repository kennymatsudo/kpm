import { describe, expect, it, vi } from 'vitest';
import { createActionService, type ActionSchedulerHooks } from './ActionService';
import type { ActionCreate, IActionRepository } from '../../db/interfaces';
import type { ActionDefinition } from '../../../shared/actions';

const input: ActionCreate = {
  name: 'Digest',
  description: '',
  projectId: null,
  prompt: 'Summarize the week.',
  icon: 'document',
  keywords: '',
  trigger: { kind: 'interval', minutes: 1440 },
  enabled: true,
  capabilities: ['read_project', 'report_finding'],
  manualRun: 'headless',
  targetType: 'none',
  model: null,
};

function stored(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    ...input,
    id: 'action-1',
    memory: null,
    lastRunAt: null,
    lastOutcome: null,
    lastError: null,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

function makeRepo(overrides: Partial<IActionRepository> = {}): IActionRepository {
  return {
    listForProject: vi.fn(() => []),
    get: vi.fn(() => stored()),
    listEnabledIntervalTriggered: vi.fn(() => []),
    listEnabledForEvent: vi.fn(() => []),
    nameExists: vi.fn(() => false),
    create: vi.fn(() => stored()),
    update: vi.fn(() => stored()),
    delete: vi.fn(() => true),
    recordRunOutcome: vi.fn(),
    updateMemory: vi.fn(),
    ...overrides,
  };
}

function makeScheduler(): ActionSchedulerHooks {
  return { sync: vi.fn(), remove: vi.fn(), runNow: vi.fn(async () => undefined) };
}

describe('createActionService', () => {
  it('rejects a duplicate name within the same scope', () => {
    const actions = makeRepo({ nameExists: vi.fn(() => true) });
    const result = createActionService({ actions }).create(input);

    expect(result).toMatchObject({ ok: false });
    expect(actions.create).not.toHaveBeenCalled();
  });

  it('syncs a new action so it runs once without waiting out the interval', () => {
    const actions = makeRepo();
    const scheduler = makeScheduler();
    const result = createActionService({ actions, scheduler }).create(input);

    expect(result.ok).toBe(true);
    expect(scheduler.sync).toHaveBeenCalledWith(stored(), { immediate: true });
  });

  it('creates without a scheduler present', () => {
    expect(createActionService({ actions: makeRepo() }).create(input).ok).toBe(true);
  });

  it('checks the name against the scope the update moves it to', () => {
    const nameExists = vi.fn(() => false);
    const actions = makeRepo({ nameExists });
    const target = '22222222-2222-4222-8222-222222222222';
    createActionService({ actions }).update('action-1', { projectId: target });

    expect(nameExists).toHaveBeenCalledWith(target, 'Digest', 'action-1');
  });

  it('rejects an update that would leave the action invalid', () => {
    const actions = makeRepo();
    const result = createActionService({ actions }).update('action-1', {
      capabilities: ['read_project', 'propose_documents'],
    });

    expect(result).toMatchObject({ ok: false });
    expect(actions.update).not.toHaveBeenCalled();
  });

  it('refuses to enable a manual action', () => {
    const actions = makeRepo({ get: vi.fn(() => stored({ trigger: { kind: 'manual' } })) });
    const result = createActionService({ actions }).setEnabled('action-1', false);

    expect(result.ok).toBe(true);
    expect(createActionService({ actions }).setEnabled('action-1', true)).toMatchObject({
      ok: false,
    });
  });

  it('unregisters a deleted action', () => {
    const scheduler = makeScheduler();
    const result = createActionService({ actions: makeRepo(), scheduler }).delete('action-1');

    expect(result.ok).toBe(true);
    expect(scheduler.remove).toHaveBeenCalledWith('action-1');
  });

  it('reports a missing action rather than throwing', () => {
    const actions = makeRepo({ get: vi.fn(() => undefined) });
    const service = createActionService({ actions });

    expect(service.update('gone', { name: 'x' })).toMatchObject({ ok: false });
    expect(service.delete('gone')).toMatchObject({ ok: false });
  });

  it('fails runNow when no runner is wired', async () => {
    await expect(createActionService({ actions: makeRepo() }).runNow('action-1')).resolves.toMatchObject({
      ok: false,
    });
  });
});
