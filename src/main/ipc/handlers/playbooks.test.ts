import { describe, expect, it, vi } from 'vitest';
import { buildPlaybookHandlers } from './playbooks';

describe('playbook IPC handlers', () => {
  it('reads providers directly from the board provider registry dependency', async () => {
    const providers = [{
      id: 'claude',
      name: 'Claude',
      available: true,
      models: [{ id: 'sonnet', name: 'Sonnet', isDefault: true }],
      capabilities: { nativeSkills: true, reviewSandbox: false },
    }];
    const providerRegistry = vi.fn().mockResolvedValue(providers);
    const service = {
      list: vi.fn(),
      getDefault: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
      setDefault: vi.fn(),
      listSkills: vi.fn(),
    } as never;

    const result = await buildPlaybookHandlers(service, providerRegistry).providers(undefined, {} as never);

    expect(result).toEqual({ providers });
    expect(providerRegistry).toHaveBeenCalledOnce();
  });
});
