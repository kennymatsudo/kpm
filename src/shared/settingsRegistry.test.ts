import { describe, it, expect } from 'vitest';
import { SETTINGS } from './settingsRegistry';

describe('settings registry codecs', () => {
  describe('chatApprovalMode', () => {
    const def = SETTINGS.chatApprovalMode;
    it('decodes a stored value', () => {
      expect(def.decode('auto_apply')).toBe('auto_apply');
      expect(def.decode('manual')).toBe('manual');
    });
    it('folds unset and unknown values to the default', () => {
      expect(def.decode(null)).toBe('manual');
      expect(def.decode(undefined)).toBe('manual');
      expect(def.decode('nonsense')).toBe('manual');
    });
    it('encodes back to the stored string', () => {
      expect(def.encode('auto_apply')).toBe('auto_apply');
    });
  });

  describe('chatProvider', () => {
    const def = SETTINGS.chatProvider;
    it('decodes known providers', () => {
      expect(def.decode('codex')).toBe('codex');
      expect(def.decode('pi')).toBe('pi');
      expect(def.decode('claude')).toBe('claude');
    });
    it('folds unset/unknown to the default provider', () => {
      expect(def.decode(null)).toBe('claude');
      expect(def.decode('gpt')).toBe('claude');
    });
    it('encodes', () => {
      expect(def.encode('pi')).toBe('pi');
    });
  });

  describe('chatModel', () => {
    const def = SETTINGS.chatModel;
    it('decodes sonnet and opus', () => {
      expect(def.decode('opus')).toBe('opus');
      expect(def.decode('sonnet')).toBe('sonnet');
    });
    it('folds unknown to the default sonnet', () => {
      expect(def.decode(null)).toBe('sonnet');
      expect(def.decode('haiku')).toBe('sonnet');
    });
  });

  describe('chatEffort', () => {
    const def = SETTINGS.chatEffort;
    it('decodes every valid chat effort level', () => {
      expect(def.decode('low')).toBe('low');
      expect(def.decode('medium')).toBe('medium');
      expect(def.decode('high')).toBe('high');
      expect(def.decode('max')).toBe('max');
    });
    it('rejects board-only xhigh and unknown values', () => {
      expect(def.decode('xhigh')).toBe('medium');
      expect(def.decode(null)).toBe('medium');
    });
  });

  describe('chatCodexModel', () => {
    const def = SETTINGS.chatCodexModel;
    it('decodes a known codex model', () => {
      expect(def.decode('gpt-5.4')).toBe('gpt-5.4');
    });
    it('folds unknown/unset to the default codex model', () => {
      expect(def.decode(null)).toBe('gpt-5.5');
      expect(def.decode('gpt-4')).toBe('gpt-5.5');
    });
  });

  describe('chatPiProviderModel', () => {
    const def = SETTINGS.chatPiProviderModel;
    it('decodes a non-empty string', () => {
      expect(def.decode('some/model')).toBe('some/model');
    });
    it('decodes unset and empty string as null', () => {
      expect(def.decode(null)).toBeNull();
      expect(def.decode('')).toBeNull();
    });
    it('encodes null as an empty string', () => {
      expect(def.encode(null)).toBe('');
      expect(def.encode('some/model')).toBe('some/model');
    });
  });

  describe('chatPiAckUnsafeProviders', () => {
    const def = SETTINGS.chatPiAckUnsafeProviders;
    it('decodes a JSON array into a Set of strings', () => {
      expect(def.decode('["a","b"]')).toEqual(new Set(['a', 'b']));
    });
    it('drops non-string entries defensively', () => {
      expect(def.decode('["a",1,null,"b"]')).toEqual(new Set(['a', 'b']));
    });
    it('returns an empty Set for unset or malformed values', () => {
      expect(def.decode(null)).toEqual(new Set());
      expect(def.decode('not json')).toEqual(new Set());
      expect(def.decode('{"not":"array"}')).toEqual(new Set());
    });
    it('round-trips through encode/decode', () => {
      const value = new Set(['x', 'y']);
      expect(def.decode(def.encode(value))).toEqual(value);
    });
  });

  describe('branchNameTemplate', () => {
    const def = SETTINGS.branchNameTemplate;
    it('decodes a stored template', () => {
      expect(def.decode('{ticket}-{name}')).toBe('{ticket}-{name}');
    });
    it('defaults to an empty string when unset', () => {
      expect(def.decode(null)).toBe('');
      expect(def.decode(undefined)).toBe('');
    });
  });

  it('exposes a unique storage key per setting', () => {
    const keys = Object.values(SETTINGS).map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
