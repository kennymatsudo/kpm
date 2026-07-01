/**
 * ScheduledLoopService
 *
 * CRUD + run-history access for scheduled loops (freeform prompts that run on
 * an interval, managed from the Command+K palette). Pure business logic over
 * the repositories; the live scheduler is driven through the optional
 * `scheduler` hooks, which the runner (ScheduledLoopRunnerService) injects so
 * that create/update/enable/delete take effect immediately without this
 * service depending on the runner's execution machinery.
 */

import type { ScheduledLoop, LoopRun } from '../../../shared/types';
import type {
  IScheduledLoopRepository,
  ILoopRunRepository,
  ScheduledLoopCreate,
  ScheduledLoopUpdate,
} from '../../db/interfaces';
import { success, failure, type ServiceResult, type AsyncResult } from '../result';

/**
 * Hooks the runner provides so CRUD mutations take effect on the live
 * PollScheduler. Optional — CRUD still works (just without live scheduling)
 * when the runner is absent (e.g. in tests).
 */
export interface LoopSchedulerHooks {
  /** (Re)register + start the loop if enabled, or stop it if disabled. */
  sync(loop: ScheduledLoop, opts?: { immediate?: boolean }): void;
  /** Remove a loop's scheduler task entirely. */
  remove(loopId: string): void;
  /** Run the loop once, immediately, off-schedule. */
  runNow(loopId: string): Promise<void>;
}

export interface ScheduledLoopServiceDeps {
  scheduledLoops: IScheduledLoopRepository;
  loopRuns: ILoopRunRepository;
  scheduler?: LoopSchedulerHooks;
}

export function createScheduledLoopService(deps: ScheduledLoopServiceDeps) {
  function list(projectId: string): ServiceResult<ScheduledLoop[]> {
    try {
      return success(deps.scheduledLoops.listByProject(projectId));
    } catch (e) {
      return failure(e instanceof Error ? e.message : String(e));
    }
  }

  function get(id: string): ServiceResult<ScheduledLoop> {
    const loop = deps.scheduledLoops.get(id);
    if (!loop) return failure(`Scheduled loop not found: ${id}`);
    return success(loop);
  }

  function create(input: ScheduledLoopCreate): ServiceResult<ScheduledLoop> {
    try {
      const loop = deps.scheduledLoops.create(input);
      // Run once right away so the user sees a result without waiting out the interval.
      deps.scheduler?.sync(loop, { immediate: true });
      return success(loop);
    } catch (e) {
      return failure(e instanceof Error ? e.message : String(e));
    }
  }

  function update(id: string, updates: ScheduledLoopUpdate): ServiceResult<ScheduledLoop> {
    if (!deps.scheduledLoops.get(id)) return failure(`Scheduled loop not found: ${id}`);
    try {
      const updated = deps.scheduledLoops.update(id, updates);
      if (!updated) return failure(`Scheduled loop not found: ${id}`);
      deps.scheduler?.sync(updated);
      return success(updated);
    } catch (e) {
      return failure(e instanceof Error ? e.message : String(e));
    }
  }

  function setEnabled(id: string, enabled: boolean): ServiceResult<ScheduledLoop> {
    return update(id, { enabled });
  }

  function deleteLoop(id: string): ServiceResult<void> {
    if (!deps.scheduledLoops.get(id)) return failure(`Scheduled loop not found: ${id}`);
    try {
      deps.scheduledLoops.delete(id);
      deps.scheduler?.remove(id);
      return success(undefined);
    } catch (e) {
      return failure(e instanceof Error ? e.message : String(e));
    }
  }

  async function runNow(id: string): AsyncResult<void> {
    if (!deps.scheduledLoops.get(id)) return failure(`Scheduled loop not found: ${id}`);
    if (!deps.scheduler) return failure('Loop runner is not available');
    try {
      await deps.scheduler.runNow(id);
      return success(undefined);
    } catch (e) {
      return failure(e instanceof Error ? e.message : String(e));
    }
  }

  function getHistory(loopId: string, limit?: number): ServiceResult<LoopRun[]> {
    try {
      return success(deps.loopRuns.listByLoop(loopId, limit));
    } catch (e) {
      return failure(e instanceof Error ? e.message : String(e));
    }
  }

  return { list, get, create, update, setEnabled, delete: deleteLoop, runNow, getHistory };
}

export type ScheduledLoopService = ReturnType<typeof createScheduledLoopService>;
