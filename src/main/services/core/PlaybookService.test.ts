import { describe, expect, it, vi } from 'vitest';
import { BUILT_IN_PLAYBOOKS, type Playbook } from '../../../shared/playbooks';
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

  it('lists built-in and custom playbooks together, Implement only first', () => {
    const { service } = createService();

    const ids = unwrapOrThrow(service.list()).map((playbook) => playbook.id);
    expect(ids[0]).toBe('builtin.implement_only');
    expect(ids).toContain('custom-1');
  });

  it('replaces a built-in with its persisted customization when listing', () => {
    const source = BUILT_IN_PLAYBOOKS.implementOnly;
    const customized = { ...source, name: 'My default run', builtIn: false as const };
    const service = createPlaybookService({
      playbooks: {
        list: () => [customized, custom],
        get: (id: string) => id === source.id ? customized : id === custom.id ? custom : undefined,
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      appSettings: { get: () => source.id, set: vi.fn() },
      listSkills: () => ({ ok: true, data: [] }),
    });

    const listed = unwrapOrThrow(service.list());
    expect(listed.filter((playbook) => playbook.id === source.id)).toEqual([customized]);
    expect(unwrapOrThrow(service.get(source.id))).toBe(customized);
  });

  it('persists an edit to a built-in as a customization with the same id', () => {
    const source = BUILT_IN_PLAYBOOKS.implementOnly;
    const create = vi.fn((playbook: Pick<Playbook, 'id' | 'name' | 'steps'>) => ({ ...playbook, builtIn: false }));
    const service = createPlaybookService({
      playbooks: { list: () => [], get: () => undefined, create, update: vi.fn(), delete: vi.fn() },
      appSettings: { get: () => source.id, set: vi.fn() },
      listSkills: () => ({ ok: true, data: [] }),
    });

    const updated = unwrapOrThrow(service.update(source.id, { name: 'My default run', steps: source.steps }));

    expect(updated).toMatchObject({ id: source.id, name: 'My default run', builtIn: false });
    expect(create).toHaveBeenCalledWith(updated);
  });

  it('deleting a built-in customization restores the built-in without changing the default id', () => {
    const source = BUILT_IN_PLAYBOOKS.implementOnly;
    const customized = { ...source, name: 'My default run', builtIn: false as const };
    const remove = vi.fn(() => true);
    const set = vi.fn();
    const service = createPlaybookService({
      playbooks: { list: () => [customized], get: () => customized, create: vi.fn(), update: vi.fn(), delete: remove },
      appSettings: { get: () => source.id, set },
      listSkills: () => ({ ok: true, data: [] }),
    });

    expect(service.delete(source.id)).toMatchObject({ ok: true });
    expect(remove).toHaveBeenCalledWith(source.id);
    expect(set).not.toHaveBeenCalled();
  });

  it('keeps an uncustomized built-in protected from deletion', () => {
    const source = BUILT_IN_PLAYBOOKS.implementOnly;
    const remove = vi.fn();
    const service = createPlaybookService({
      playbooks: { list: () => [], get: () => undefined, create: vi.fn(), update: vi.fn(), delete: remove },
      appSettings: { get: () => source.id, set: vi.fn() },
      listSkills: () => ({ ok: true, data: [] }),
    });

    expect(service.delete(source.id)).toMatchObject({ ok: false });
    expect(remove).not.toHaveBeenCalled();
  });

  it('defaults a fresh install with no configured default to Implement only', () => {
    const service = createPlaybookService({
      playbooks: { list: () => [], get: () => undefined, create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      appSettings: { get: () => undefined, set: vi.fn() },
      listSkills: () => ({ ok: true, data: [] }),
    });

    expect(unwrapOrThrow(service.getDefault())).toBe('builtin.implement_only');
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
