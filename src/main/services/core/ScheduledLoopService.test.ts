import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createScheduledLoopService, type LoopSchedulerHooks } from './ScheduledLoopService';
import type { IScheduledLoopRepository, ILoopRunRepository } from '../../db/interfaces';
import type { ScheduledLoop } from '../../../shared/types';

function makeLoop(over: Partial<ScheduledLoop> = {}): ScheduledLoop {
  return {
    id: 'loop-1',
    project_id: 'proj-1',
    name: 'Test loop',
    prompt: 'do the thing',
    output_mode: 'notify',
    interval_minutes: 30,
    enabled: true,
    last_run_at: null,
    last_outcome: null,
    last_error: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('ScheduledLoopService', () => {
  let scheduledLoops: IScheduledLoopRepository;
  let loopRuns: ILoopRunRepository;
  let scheduler: LoopSchedulerHooks;

  beforeEach(() => {
    scheduledLoops = {
      listByProject: vi.fn().mockReturnValue([]),
      get: vi.fn(),
      getAllEnabled: vi.fn().mockReturnValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockReturnValue(true),
      recordRunOutcome: vi.fn(),
    };
    loopRuns = {
      create: vi.fn(),
      listByLoop: vi.fn().mockReturnValue([]),
      pruneOld: vi.fn(),
    };
    scheduler = {
      sync: vi.fn(),
      remove: vi.fn(),
      runNow: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('create persists the loop and syncs the scheduler', () => {
    const loop = makeLoop();
    vi.mocked(scheduledLoops.create).mockReturnValue(loop);
    const svc = createScheduledLoopService({ scheduledLoops, loopRuns, scheduler });

    const res = svc.create({
      project_id: 'proj-1',
      name: 'Test loop',
      prompt: 'do the thing',
      output_mode: 'notify',
      interval_minutes: 30,
    });

    expect(res.ok).toBe(true);
    expect(scheduledLoops.create).toHaveBeenCalledOnce();
    expect(scheduler.sync).toHaveBeenCalledWith(loop, { immediate: true });
  });

  it('update fails (and does not sync) when the loop is missing', () => {
    vi.mocked(scheduledLoops.get).mockReturnValue(undefined);
    const svc = createScheduledLoopService({ scheduledLoops, loopRuns, scheduler });

    const res = svc.update('missing', { name: 'x' });

    expect(res.ok).toBe(false);
    expect(scheduler.sync).not.toHaveBeenCalled();
  });

  it('update syncs the scheduler with the updated loop', () => {
    const updated = makeLoop({ name: 'Renamed', interval_minutes: 60 });
    vi.mocked(scheduledLoops.get).mockReturnValue(makeLoop());
    vi.mocked(scheduledLoops.update).mockReturnValue(updated);
    const svc = createScheduledLoopService({ scheduledLoops, loopRuns, scheduler });

    const res = svc.update('loop-1', { name: 'Renamed', interval_minutes: 60 });

    expect(res.ok).toBe(true);
    expect(scheduler.sync).toHaveBeenCalledWith(updated);
  });

  it('delete removes the scheduler task', () => {
    vi.mocked(scheduledLoops.get).mockReturnValue(makeLoop());
    const svc = createScheduledLoopService({ scheduledLoops, loopRuns, scheduler });

    const res = svc.delete('loop-1');

    expect(res.ok).toBe(true);
    expect(scheduledLoops.delete).toHaveBeenCalledWith('loop-1');
    expect(scheduler.remove).toHaveBeenCalledWith('loop-1');
  });

  it('runNow delegates to the scheduler hook', async () => {
    vi.mocked(scheduledLoops.get).mockReturnValue(makeLoop());
    const svc = createScheduledLoopService({ scheduledLoops, loopRuns, scheduler });

    const res = await svc.runNow('loop-1');

    expect(res.ok).toBe(true);
    expect(scheduler.runNow).toHaveBeenCalledWith('loop-1');
  });

  it('runNow fails when no scheduler is attached', async () => {
    vi.mocked(scheduledLoops.get).mockReturnValue(makeLoop());
    const svc = createScheduledLoopService({ scheduledLoops, loopRuns });

    const res = await svc.runNow('loop-1');

    expect(res.ok).toBe(false);
  });
});
