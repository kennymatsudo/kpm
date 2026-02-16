import { describe, it, expect, beforeEach } from 'vitest';
import { createPromptOverrideService } from './PromptOverrideService';
import type { IAppSettingsRepository } from '../../db/interfaces/settings';

function createMockAppSettings(): IAppSettingsRepository {
  const store = new Map<string, string>();
  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: string) => { store.set(key, value); },
    delete: (key: string) => { store.delete(key); },
    getAll: () => Object.fromEntries(store),
  };
}

describe('PromptOverrideService', () => {
  let appSettings: IAppSettingsRepository;
  let service: ReturnType<typeof createPromptOverrideService>;

  beforeEach(() => {
    appSettings = createMockAppSettings();
    service = createPromptOverrideService({ appSettings });
  });

  describe('getContent', () => {
    it('returns default content when no override exists', () => {
      const result = service.getContent('system.constraints');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toContain('Constraints');
        expect(result.data.length).toBeGreaterThan(0);
      }
    });

    it('returns override content when one exists', () => {
      service.setOverride('system.constraints', 'Custom constraints');
      const result = service.getContent('system.constraints');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe('Custom constraints');
      }
    });

    it('returns failure for unknown prompt key', () => {
      const result = service.getContent('nonexistent.key');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Unknown prompt key');
      }
    });
  });

  describe('getDefault', () => {
    it('returns registry default content', () => {
      const result = service.getDefault('system.response_style');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toContain('Response Style');
      }
    });

    it('returns default even when override exists', () => {
      service.setOverride('system.response_style', 'Custom style');
      const result = service.getDefault('system.response_style');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toContain('Response Style');
        expect(result.data).not.toBe('Custom style');
      }
    });
  });

  describe('hasOverride', () => {
      expect(service.hasOverride('system.constraints')).toBe(false);
      service.setOverride('system.constraints', 'Custom');
      expect(service.hasOverride('system.constraints')).toBe(true);
    });
  });

  describe('setOverride', () => {
    it('stores override in app settings', () => {
      const result = service.setOverride('system.constraints', 'New constraints');
      expect(result.ok).toBe(true);
      expect(appSettings.get('prompt_override:system.constraints')).toBe('New constraints');
    });

    it('returns failure for unknown prompt key', () => {
      const result = service.setOverride('bad.key', 'content');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Unknown prompt key');
      }
    });
  });

  describe('resetToDefault', () => {
    it('removes override and reverts to default', () => {
      service.setOverride('system.constraints', 'Custom');
      const overridden = service.getContent('system.constraints');
      expect(overridden.ok).toBe(true);
      if (overridden.ok) expect(overridden.data).toBe('Custom');

      service.resetToDefault('system.constraints');
      const result = service.getContent('system.constraints');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toContain('Constraints');
        expect(result.data).not.toBe('Custom');
      }
    });

    it('is safe to call when no override exists', () => {
      expect(() => service.resetToDefault('system.constraints')).not.toThrow();
    });
  });

  describe('listAll', () => {
    it('returns all prompt definitions', () => {
      const all = service.listAll();
      expect(all.length).toBeGreaterThan(0);
      expect(all.every(p => p.key && p.name && p.description && p.category)).toBe(true);
    });

    it('shows correct override status', () => {
      service.setOverride('system.constraints', 'Custom');

      const all = service.listAll();
      const constraints = all.find(p => p.key === 'system.constraints');
      const responseStyle = all.find(p => p.key === 'system.response_style');

      expect(constraints?.hasOverride).toBe(true);
      expect(responseStyle?.hasOverride).toBe(false);
    });
  });

  describe('listByCategory', () => {
    });
  });

  describe('getDefinition', () => {
      const def = service.getDefinition('system.constraints');
      expect(def).toBeDefined();
      expect(def!.key).toBe('system.constraints');
      expect(def!.name).toBe('Constraints');
      expect(def!.hasOverride).toBe(false);
      expect(def!.currentContent).toBe(def!.defaultContent);

      service.setOverride('system.constraints', 'Custom');
    });

    it('returns undefined for unknown key', () => {
      expect(service.getDefinition('nonexistent')).toBeUndefined();
    });
  });
});
