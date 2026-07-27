/**
 * Action Repository Interfaces
 *
 * Contracts for persisting actions (saved prompts, optionally triggered) and
 * their run history. A null `projectId` means the action is available in every
 * project.
 */

import type {
  ActionDefinition,
  ActionEditable,
  ActionRun,
  ActionRunOutcome,
  ActionTriggerEvent,
} from '../../../shared/actions';

export type ActionCreate = ActionEditable;

export type ActionUpdate = Partial<ActionEditable>;

export interface ActionRunCreate {
  actionId: string;
  outcome: ActionRunOutcome;
  summary?: string | null;
  detail?: string | null;
  error?: string | null;
  artifactPath?: string | null;
  startedAt?: string;
  finishedAt?: string | null;
}

export interface IActionRepository {
  /**
   * Actions visible in a project: its own plus every global one, newest first.
   */
  listForProject(projectId: string): ActionDefinition[];
  get(id: string): ActionDefinition | undefined;
  /** Enabled interval-triggered actions across all projects, for boot reconciliation. */
  listEnabledIntervalTriggered(): ActionDefinition[];
  /** Enabled actions listening for a given event. */
  listEnabledForEvent(event: ActionTriggerEvent): ActionDefinition[];
  /** Whether a name is already taken within the same scope. */
  nameExists(projectId: string | null, name: string, excludeId?: string): boolean;
  create(action: ActionCreate): ActionDefinition;
  /** Apply a partial update and return the updated row (undefined if not found). */
  update(id: string, updates: ActionUpdate): ActionDefinition | undefined;
  delete(id: string): boolean;
  /** Stamp the last-run summary fields after a run. */
  recordRunOutcome(
    id: string,
    outcome: ActionRunOutcome,
    error: string | null,
    ranAt: string
  ): void;
  /** Replace the action's carried-forward memory after a non-error run. */
  updateMemory(id: string, memory: string): void;
}

export interface IActionRunRepository {
  create(run: ActionRunCreate): ActionRun;
  /** Most recent runs for an action, newest first. */
  listByAction(actionId: string, limit?: number): ActionRun[];
  /** Retain only the `keep` newest runs for an action. */
  pruneOld(actionId: string, keep: number): void;
}
