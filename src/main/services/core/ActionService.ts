/**
 * ActionService
 *
 * Mutations for actions (saved prompts, optionally triggered). Carries the two
 * behaviours a repository call cannot: name uniqueness within a scope, and
 * keeping the live scheduler in step with CRUD. Plain reads (list, get, run
 * history) go straight from the IPC handler to the repositories.
 *
 * The scheduler is injected as hooks by the runner so create/update/enable take
 * effect immediately without this service depending on execution machinery.
 */

import {
  getActionValidationIssues,
  isAutomatic,
  toEditable,
  type ActionDefinition,
} from '../../../shared/actions';
import type { ActionCreate, ActionUpdate, IActionRepository } from '../../db/interfaces';
import { success, failure, type ServiceResult, type AsyncResult } from '../result';

export interface ActionSchedulerHooks {
  /** (Re)register the action if it is enabled and automatic, or stop it if not. */
  sync(action: ActionDefinition, opts?: { immediate?: boolean }): void;
  /** Remove an action's scheduler registration entirely. */
  remove(actionId: string): void;
  /** Run the action once, immediately, off-schedule. */
  runNow(actionId: string): Promise<void>;
}

export interface ActionServiceDeps {
  actions: IActionRepository;
  scheduler?: ActionSchedulerHooks;
}

export function createActionService(deps: ActionServiceDeps) {
  function create(input: ActionCreate): ServiceResult<ActionDefinition> {
    if (deps.actions.nameExists(input.projectId, input.name)) {
      return failure(`An action named "${input.name}" already exists.`);
    }
    try {
      const action = deps.actions.create(input);
      // Run once on creation so a triggered action shows a result without
      // waiting out its first interval. A disabled action stays put.
      deps.scheduler?.sync(action, { immediate: true });
      return success(action);
    } catch (e) {
      return failure(e instanceof Error ? e.message : String(e));
    }
  }

  function update(id: string, updates: ActionUpdate): ServiceResult<ActionDefinition> {
    const existing = deps.actions.get(id);
    if (!existing) return failure(`Action not found: ${id}`);

    // The cross-field rules only hold over a whole action, and the IPC layer can
    // only type-check the partial, so re-validate the merged result here.
    const merged = { ...toEditable(existing), ...updates };
    const issues = getActionValidationIssues(merged);
    if (issues.length > 0) return failure(issues.map((issue) => issue.message).join(' '));

    if (deps.actions.nameExists(merged.projectId, merged.name, id)) {
      return failure(`An action named "${merged.name}" already exists.`);
    }

    try {
      const updated = deps.actions.update(id, updates);
      if (!updated) return failure(`Action not found: ${id}`);
      deps.scheduler?.sync(updated);
      return success(updated);
    } catch (e) {
      return failure(e instanceof Error ? e.message : String(e));
    }
  }

  function setEnabled(id: string, enabled: boolean): ServiceResult<ActionDefinition> {
    const existing = deps.actions.get(id);
    if (!existing) return failure(`Action not found: ${id}`);
    if (enabled && !isAutomatic(existing.trigger)) {
      return failure('A manual action has no trigger to enable.');
    }
    return update(id, { enabled });
  }

  function deleteAction(id: string): ServiceResult<void> {
    if (!deps.actions.get(id)) return failure(`Action not found: ${id}`);
    try {
      deps.actions.delete(id);
      deps.scheduler?.remove(id);
      return success(undefined);
    } catch (e) {
      return failure(e instanceof Error ? e.message : String(e));
    }
  }

  async function runNow(id: string): AsyncResult<void> {
    if (!deps.actions.get(id)) return failure(`Action not found: ${id}`);
    if (!deps.scheduler) return failure('Action runner is not available');
    try {
      await deps.scheduler.runNow(id);
      return success(undefined);
    } catch (e) {
      return failure(e instanceof Error ? e.message : String(e));
    }
  }

  return { create, update, setEnabled, delete: deleteAction, runNow };
}

export type ActionService = ReturnType<typeof createActionService>;
