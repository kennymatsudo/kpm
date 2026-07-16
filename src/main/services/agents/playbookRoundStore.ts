/** Owns a board session's per-round interpreter state: fan-out run groups, step outputs, and their restart reconstruction. */

import type { ReviewFinding } from '../../../shared/agent-types';
import type { PlaybookStep } from '../../../shared/playbooks';
import { parsePassCounts } from '../../../shared/playbookRuntime';
import type { DevSession } from '../../../shared/types';
import type { IAgentReviewRepository } from '../../db/interfaces/review';
import { toPlaybookSubagentSessionId } from './autoReview';

export interface RunGroup {
  expected: number;
  attempt: number;
  succeeded: Set<number>;
  failed: Set<number>;
  findings: ReviewFinding[];
  output: Map<number, string>;
}

interface PlaybookRoundStoreDeps {
  agentReviews: Pick<IAgentReviewRepository, 'getByReviewSessionIds'>;
  saveOutputs: (sessionId: string, outputs: Record<string, string[]>) => void;
}

export function createPlaybookRoundStore(deps: PlaybookRoundStoreDeps) {
  const outputs = new Map<string, Record<string, string[]>>();
  // Cache only. Persisted review rows are authoritative and reconstruct this
  // aggregation after a main-process restart.
  const runGroups = new Map<string, RunGroup>();

  const groupKey = (sessionId: string, stepId: string) => `${sessionId}:${stepId}`;
  const attemptForStep = (session: DevSession, step: PlaybookStep) => parsePassCounts(session.step_pass_counts)[step.id] ?? 0;
  const reviewSessionIds = (session: DevSession, step: PlaybookStep, expected: number) => {
    const attempt = attemptForStep(session, step);
    return Array.from({ length: expected }, (_, runIndex) =>
      toPlaybookSubagentSessionId(session.id, step.id, attempt, runIndex));
  };

  function reconstructRunGroup(session: DevSession, step: PlaybookStep, expected: number): RunGroup {
    const group: RunGroup = {
      expected,
      attempt: attemptForStep(session, step),
      succeeded: new Set<number>(),
      failed: new Set<number>(),
      findings: [],
      output: new Map<number, string>(),
    };
    const persisted = deps.agentReviews.getByReviewSessionIds(reviewSessionIds(session, step, expected));
    for (const run of persisted) {
      if (run.run_index == null || run.run_index < 0 || run.run_index >= expected) continue;
      if (run.status === 'complete') {
        group.succeeded.add(run.run_index);
        group.findings.push(...run.findings);
        if (run.raw_output) group.output.set(run.run_index, run.raw_output);
      } else if (run.status === 'failed') {
        group.failed.add(run.run_index);
      }
      // A persisted `running` row belongs to a process that no longer owns a
      // runtime after restart. Dispatch relaunches that same concrete run id.
    }
    return group;
  }

  function outputsFor(session: DevSession): Record<string, string[]> {
    const cached = outputs.get(session.id);
    if (cached) return cached;
    if (session.step_outputs) {
      try {
        const parsed = JSON.parse(session.step_outputs) as Record<string, string[]>;
        outputs.set(session.id, parsed);
        return parsed;
      } catch { /* start with an empty output channel */ }
    }
    const empty: Record<string, string[]> = {};
    outputs.set(session.id, empty);
    return empty;
  }

  function persistOutputs(session: DevSession, value: Record<string, string[]>): void {
    outputs.set(session.id, value);
    deps.saveOutputs(session.id, value);
  }

  return {
    outputsFor,
    persistOutputs,
    attemptForStep,
    reconstructRunGroup,
    getGroup: (sessionId: string, stepId: string) => runGroups.get(groupKey(sessionId, stepId)),
    setGroup: (sessionId: string, stepId: string, group: RunGroup) => runGroups.set(groupKey(sessionId, stepId), group),
    deleteGroup: (sessionId: string, stepId: string) => runGroups.delete(groupKey(sessionId, stepId)),
  };
}

export type PlaybookRoundStore = ReturnType<typeof createPlaybookRoundStore>;
