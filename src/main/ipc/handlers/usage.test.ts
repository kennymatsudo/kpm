import { describe, expect, it, vi } from 'vitest';
import { buildUsageHandlers } from './usage';

describe('usage IPC handlers', () => {
  it('returns grouped persisted playbook costs for a dev session', () => {
    const service = {
      getBoardPlaybookStepCosts: vi.fn().mockReturnValue({ implement: 1200, review: 3400 }),
    };

    const result = buildUsageHandlers(service as never).getDevSessionStepCosts({ devSessionId: '00000000-0000-4000-8000-000000000001' }, {} as never);

    expect(result).toEqual({ costs: { implement: 1200, review: 3400 } });
    expect(service.getBoardPlaybookStepCosts).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
  });
});
