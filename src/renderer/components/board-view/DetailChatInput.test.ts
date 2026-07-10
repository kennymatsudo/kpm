import { describe, expect, it, vi } from 'vitest';

vi.mock('../../stores', () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
import { getDetailChatInputAvailability, getDetailChatInputSendMode } from './DetailChatInput';

const SNAPSHOT = '{"id":"custom"}';

describe('DetailChatInput interpreter exclusivity', () => {
  it.each([
    ['reviewing', 'critic-a'],
    ['addressing_review', 'repair-a'],
    ['idle', 'custom-step'],
    ['fixing_commit_hooks', 'custom-step'],
  ] as const)('blocks free-form interaction while a persisted playbook step is in flight (%s)', (automationPhase, currentStepId) => {
    expect(getDetailChatInputAvailability({
      agentState: 'complete',
      playbookSnapshot: SNAPSHOT,
      currentStepId,
      automationPhase,
    })).toEqual({ allowed: false, placeholder: 'Stop to interact' });
  });

  it.each([
    ['paused', 'custom-step', 'working'],
    ['needs_attention', 'custom-step', 'failed'],
    ['ready_for_review', null, 'complete'],
  ] as const)('allows interaction at a playbook halt point (%s)', (automationPhase, currentStepId, agentState) => {
    expect(getDetailChatInputAvailability({
      agentState,
      playbookSnapshot: SNAPSHOT,
      currentStepId,
      automationPhase,
    }).allowed).toBe(true);
  });

  it('routes playbook halt-point messages through interpreter resume, never agent respond/follow-up', () => {
    expect(getDetailChatInputSendMode({
      agentState: 'waiting_for_input',
      playbookSnapshot: SNAPSHOT,
      currentStepId: 'custom-step',
    })).toBe('resume_playbook');
  });

  it('preserves question and terminal interaction for pre-migration unsnapshotted sessions', () => {
    expect(getDetailChatInputAvailability({ agentState: 'waiting_for_input' }).allowed).toBe(true);
    expect(getDetailChatInputSendMode({ agentState: 'waiting_for_input' })).toBe('respond');
    expect(getDetailChatInputAvailability({ agentState: 'complete' }).allowed).toBe(true);
    expect(getDetailChatInputSendMode({ agentState: 'complete' })).toBe('follow_up');
  });
});
