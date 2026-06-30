/**
 * Scheduled Loop Repository Interfaces
 *
 * Contracts for persisting scheduled loops (freeform prompts that run on an
 * interval) and their run history. Project-scoped, unlike global custom prompts.
 */

import type { ScheduledLoop, LoopRun, LoopOutputMode, LoopRunOutcome } from '../../../shared/types';

export interface ScheduledLoopCreate {
  project_id: string;
  name: string;
  prompt: string;
  output_mode: LoopOutputMode;
  interval_minutes: number;
  /** Defaults to true (enabled) when omitted. */
  enabled?: boolean;
}

export type ScheduledLoopUpdate = Partial<
  Pick<ScheduledLoop, 'name' | 'prompt' | 'output_mode' | 'interval_minutes' | 'enabled'>
>;

export interface LoopRunCreate {
  loop_id: string;
  outcome: LoopRunOutcome;
  summary?: string | null;
  error?: string | null;
  artifact_path?: string | null;
  started_at?: string;
  finished_at?: string | null;
}

export interface IScheduledLoopRepository {
  /** All loops for a project, newest first. */
  listByProject(projectId: string): ScheduledLoop[];
  get(id: string): ScheduledLoop | undefined;
  /** Every enabled loop across all projects — used for boot reconciliation. */
  getAllEnabled(): ScheduledLoop[];
  create(loop: ScheduledLoopCreate): ScheduledLoop;
  /** Apply a partial update and return the updated row (undefined if not found). */
  update(id: string, updates: ScheduledLoopUpdate): ScheduledLoop | undefined;
  delete(id: string): boolean;
  /** Stamp the last-run summary fields after a tick. */
  recordRunOutcome(id: string, outcome: LoopRunOutcome, error: string | null, ranAt: string): void;
}

export interface ILoopRunRepository {
  create(run: LoopRunCreate): LoopRun;
  /** Most recent runs for a loop, newest first. */
  listByLoop(loopId: string, limit?: number): LoopRun[];
  /** Retain only the `keep` newest runs for a loop. */
  pruneOld(loopId: string, keep: number): void;
}
