import { describe, expect, it } from 'vitest';
import type { DevSessionAutomationPhase } from '../../../shared/types';
import { automationPhaseAfterManualCommitResolution } from './DevSessionService';

describe('automationPhaseAfterManualCommitResolution', () => {
  it.each([
    ['fixing_commit_hooks', 'idle'],
    ['needs_attention', 'idle'],
    ['addressing_review', 'ready_for_review'],
    ['fixing_commit_hooks_after_review', 'ready_for_review'],
  ] satisfies [DevSessionAutomationPhase, DevSessionAutomationPhase][])(
    'resolves %s after a successful manual commit',
    (phase, expected) => {
      expect(automationPhaseAfterManualCommitResolution(phase)).toBe(expected);
    },
  );

  it.each([
    null,
    'idle',
    'reviewing',
    'ready_for_review',
  ] satisfies (DevSessionAutomationPhase | null)[])(
    'preserves unrelated phase %s',
    (phase) => {
      expect(automationPhaseAfterManualCommitResolution(phase)).toBe(phase);
    },
  );
});
