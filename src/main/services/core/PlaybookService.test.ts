import { describe, expect, it, vi } from 'vitest';
import { BUILT_IN_PLAYBOOKS } from '../../../shared/playbooks';
import { createPlaybookService } from './PlaybookService';
import { unwrapOrThrow } from '../result';

const custom = { ...BUILT_IN_PLAYBOOKS.implementOnly, id: 'custom-1', name: 'Custom', builtIn: false as const };

describe('PlaybookService', () => {
  function createService() {
    const set = vi.fn();
    const service = createPlaybookService({
      playbooks: {
        list: () => [custom],
        get: (id: string) => id === custom.id ? custom : undefined,
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      appSettings: { get: () => custom.id, set },
      listSkills: () => ({ ok: true, data: [] }),
    });

    return { service, set };
  }

  it('lists built-in and custom playbooks together', () => {
    const { service } = createService();

    expect(unwrapOrThrow(service.list()).map((playbook) => playbook.id)).toContain('builtin.implement_only');
    expect(unwrapOrThrow(service.list()).map((playbook) => playbook.id)).toContain('custom-1');
  });

  it('returns a configured custom playbook as the default', () => {
    const { service } = createService();

    expect(unwrapOrThrow(service.getDefault())).toBe('custom-1');
  });

  it('persists only defaults that identify an existing playbook', () => {
    const { service, set } = createService();

    expect(service.setDefault('missing')).toMatchObject({ ok: false });
    expect(service.setDefault('builtin.implement_only')).toMatchObject({ ok: true });
    expect(set).toHaveBeenCalledWith('default_playbook_id', 'builtin.implement_only');
  });
});
