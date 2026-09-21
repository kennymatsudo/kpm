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

  it('defaults the event listing limit to 100 when the caller omits it', () => {
    const service = { listRecentEvents: vi.fn().mockReturnValue([]) };

    const result = buildUsageHandlers(service as never).listEvents({ projectId: 'proj-1' }, {} as never);

    expect(result).toEqual([]);
    expect(service.listRecentEvents).toHaveBeenCalledWith('proj-1', 100);
  });

  it('clears usage events for the project and reports success', () => {
    const service = { resetProject: vi.fn() };

    const result = buildUsageHandlers(service as never).resetProject({ projectId: 'proj-1' }, {} as never);

    expect(service.resetProject).toHaveBeenCalledWith('proj-1');
    expect(result).toEqual({ success: true });
  });
});
