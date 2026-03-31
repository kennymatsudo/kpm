import { describe, expect, it } from 'vitest';
import { getToolActivity } from './activity';

describe('getToolActivity', () => {
  it('formats Codex subagent tasks as explicit delegation activity', () => {
    const activity = getToolActivity('Task', {
      subagent_type: 'codex:codex-rescue',
      description: 'Investigate the regression in the auth flow.',
    });

    expect(activity).toMatchObject({
      type: 'other',
      label: 'Delegating to Codex',
      detail: 'codex rescue: Investigate the regression in the auth flow.',
    });
  });

  it('preserves generic Task activity for non-Codex subagents', () => {
    const activity = getToolActivity('Task', {
      subagent_type: 'design-reviewer',
      description: 'Review the API shape.',
    });

    expect(activity).toMatchObject({
      type: 'other',
      label: 'design-reviewer',
      detail: 'Review the API shape.',
    });
  });
});
