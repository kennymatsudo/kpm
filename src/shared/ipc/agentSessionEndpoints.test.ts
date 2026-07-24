import { describe, expect, it } from 'vitest';
import { agentSessionEndpoints } from './agentSessionEndpoints';

const requiredParams = {
  planItemId: '00000000-0000-4000-8000-000000000001',
  repoId: '00000000-0000-4000-8000-000000000002',
};

describe('agentSessionEndpoints.createAndStart', () => {
  it('accepts omitted and empty extra instructions', () => {
    expect(agentSessionEndpoints.createAndStart.params.safeParse(requiredParams).success).toBe(true);
    expect(agentSessionEndpoints.createAndStart.params.safeParse({
      ...requiredParams,
      prompt: '',
    }).success).toBe(true);
  });
});
