import { describe, expect, it, vi } from 'vitest';
import type { DevSession, DevSessionAutomationPhase } from '../../../shared/types';
import {
  createAutomationPhaseMachine,
  effectivePhase,
  type AutomationPhaseRepository,
} from './automationPhaseMachine';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}));

function fakeRepository(initialPhase: DevSessionAutomationPhase | null): AutomationPhaseRepository {
  let phase = initialPhase;
  return {
    get: (id: string) =>
      ({ id, project_id: 'p1', status: 'active', automation_phase: phase, current_step_id: null, step_pass_counts: null, paused_reason: null }) as DevSession,
    updateAutomationPhase: (_id, next) => {
      phase = next;
    },
  };
}

function transitionFrom(
  initialPhase: DevSessionAutomationPhase | null,
  event: Parameters<ReturnType<typeof createAutomationPhaseMachine>['transition']>[1],
): DevSessionAutomationPhase | null {
  const machine = createAutomationPhaseMachine({ devSessions: fakeRepository(initialPhase) });
  return machine.transition('session-1', event);
}

describe('automationPhaseMachine.transition', () => {
  it('returns null and does not throw for an unknown session', () => {
    const devSessions: AutomationPhaseRepository = {
      get: () => undefined,
      updateAutomationPhase: vi.fn(),
    };
    const machine = createAutomationPhaseMachine({ devSessions });
    expect(machine.transition('missing', { type: 'sessionStarted' })).toBeNull();
  });

  it('keeps custom playbook cursors live between steps using explicit next-step phase data', () => {
    expect(transitionFrom('reviewing', {
      type: 'stepCompleted',
      stepId: 'critic-a',
      nextStepId: 'repair-a',
      nextPhase: 'addressing_review',
    })).toBe('addressing_review');
    expect(transitionFrom('addressing_review', {
      type: 'stepCompleted',
      stepId: 'repair-a',
      nextStepId: 'critic-b',
      nextPhase: 'reviewing',
    })).toBe('reviewing');
  });

  it('does not infer idle from a custom next step when explicit phase data is unavailable', () => {
    expect(transitionFrom('reviewing', {
      type: 'stepCompleted',
      stepId: 'critic-a',
      nextStepId: 'repair-a',
    })).toBe('reviewing');
  });

  it('opposingReviewLaunched always moves to reviewing', () => {
    expect(transitionFrom('idle', { type: 'opposingReviewLaunched' })).toBe('reviewing');
    expect(transitionFrom('needs_attention', { type: 'opposingReviewLaunched' })).toBe('reviewing');
  });

  it('opposingReviewLaunchAborted always moves to idle', () => {
    expect(transitionFrom('reviewing', { type: 'opposingReviewLaunchAborted' })).toBe('idle');
  });

  it.each(['idle', 'reviewing', 'ready_for_review', null] satisfies (DevSessionAutomationPhase | null)[])(
    'opposingReviewFindingsReady moves %s to addressing_review',
    (phase) => {
      expect(transitionFrom(phase, { type: 'opposingReviewFindingsReady' })).toBe('addressing_review');
    },
  );

  it.each(['idle', 'reviewing'] satisfies DevSessionAutomationPhase[])(
    'prReviewThreadsQueued moves %s to addressing_review',
    (phase) => {
      expect(transitionFrom(phase, { type: 'prReviewThreadsQueued' })).toBe('addressing_review');
    },
  );

  it('opposingReviewFindingsReady does not clobber needs_attention', () => {
    expect(transitionFrom('needs_attention', { type: 'opposingReviewFindingsReady' })).toBe('needs_attention');
  });

  it('prReviewThreadsQueued does not clobber needs_attention (closes the race the two automated paths had)', () => {
    expect(transitionFrom('needs_attention', { type: 'prReviewThreadsQueued' })).toBe('needs_attention');
  });

  it('movedToReview always moves to ready_for_review', () => {
    expect(transitionFrom('addressing_review', { type: 'movedToReview' })).toBe('ready_for_review');
  });

  it.each(['reviewing', 'addressing_review', 'fixing_commit_hooks', 'paused'] satisfies DevSessionAutomationPhase[])(
    'agentTerminatedUnexpectedly moves %s to needs_attention',
    (phase) => {
      expect(transitionFrom(phase, { type: 'agentTerminatedUnexpectedly' })).toBe('needs_attention');
    },
  );

  it.each(['idle', 'ready_for_review', 'needs_attention', null] satisfies (DevSessionAutomationPhase | null)[])(
    'agentTerminatedUnexpectedly leaves %s unchanged',
    (phase) => {
      expect(transitionFrom(phase, { type: 'agentTerminatedUnexpectedly' })).toBe(phase);
    },
  );

  it.each([
    ['idle', 'fixing_commit_hooks'],
    ['reviewing', 'fixing_commit_hooks'],
    ['addressing_review', 'fixing_commit_hooks'],
    ['fixing_commit_hooks', 'fixing_commit_hooks'],
  ] satisfies [DevSessionAutomationPhase, DevSessionAutomationPhase][])(
    'commitHookRepairStarted from %s enters %s',
    (phase, expected) => {
      expect(transitionFrom(phase, { type: 'commitHookRepairStarted' })).toBe(expected);
    },
  );

  it.each([
    ['fixing_commit_hooks', 'idle'],
    ['needs_attention', 'idle'],
    ['addressing_review', 'ready_for_review'],

  ] satisfies [DevSessionAutomationPhase, DevSessionAutomationPhase][])(
    'manualCommitResolved resolves %s to %s',
    (phase, expected) => {
      expect(transitionFrom(phase, { type: 'manualCommitResolved' })).toBe(expected);
    },
  );

  it.each(['idle', 'reviewing', 'ready_for_review', null] satisfies (DevSessionAutomationPhase | null)[])(
    'manualCommitResolved leaves unrelated phase %s unchanged',
    (phase) => {
      expect(transitionFrom(phase, { type: 'manualCommitResolved' })).toBe(phase);
    },
  );

  it('automationDismissed moves needs_attention to idle', () => {
    expect(transitionFrom('needs_attention', { type: 'automationDismissed' })).toBe('idle');
  });

  it('automationDismissed leaves other phases unchanged', () => {
    expect(transitionFrom('reviewing', { type: 'automationDismissed' })).toBe('reviewing');
  });

  it('sessionStarted resets to idle without inventing a cursor for a terminal playbook', () => {
    const session = {
      id: 's1', project_id: 'p1', status: 'inactive', automation_phase: 'ready_for_review',
      current_step_id: null, step_pass_counts: null, paused_reason: null,
    } as DevSession;
    const updateAutomationState = vi.fn();
    const machine = createAutomationPhaseMachine({
      devSessions: {
        get: () => session,
        updateAutomationPhase: vi.fn(),
        updateAutomationState,
      },
    });

    expect(machine.transition('s1', { type: 'sessionStarted' })).toBe('idle');
    expect(updateAutomationState).toHaveBeenCalledWith('s1', expect.objectContaining({ currentStepId: null }));
  });

  it('automationFailed always moves to needs_attention, carrying a reason for logs', () => {
    expect(transitionFrom('reviewing', { type: 'automationFailed', reason: 'commit-capture-failed' })).toBe(
      'needs_attention',
    );
  });

  it('is a no-op (no repository write) when the event does not change the phase', () => {
    const updateAutomationPhase = vi.fn();
    const devSessions: AutomationPhaseRepository = {
      get: () => ({ id: 's1', project_id: 'p1', status: 'active', automation_phase: 'idle', current_step_id: null, step_pass_counts: null, paused_reason: null }) as DevSession,
      updateAutomationPhase,
    };
    const machine = createAutomationPhaseMachine({ devSessions });
    machine.transition('s1', { type: 'automationDismissed' });
    expect(updateAutomationPhase).not.toHaveBeenCalled();
  });
});

describe('effectivePhase', () => {
  it('unwraps commit-hook-repair phases to where they were entered from', () => {
    expect(effectivePhase('fixing_commit_hooks')).toBe('idle');
    expect(effectivePhase('fixing_commit_hooks', 'address')).toBe('addressing_review');
  });

  it('passes through every other phase unchanged', () => {
    expect(effectivePhase('reviewing')).toBe('reviewing');
    expect(effectivePhase('needs_attention')).toBe('needs_attention');
    expect(effectivePhase(null)).toBeNull();
  });
});
