import { describe, expect, it } from 'vitest';
import { PI_UNRESOLVED_MODEL_ID, type PiProviderOption } from '../../../shared/types';
import {
  findPiProviderOption,
  getPiOptionDisplay,
  piProviderModelSelector,
  pickDefaultPiProviderOption,
  requiresUnsafeAcknowledgment,
  withAcknowledgedProvider,
} from './piProviderSelection';

const openaiCodex: PiProviderOption = { provider: 'openai-codex', modelId: 'gpt-5.4', label: 'OpenAI Codex — GPT-5.4', safe: true };
const cursor: PiProviderOption = { provider: 'cursor', modelId: 'cursor-default', label: 'cursor — Cursor Default', safe: false };

describe('piProviderModelSelector', () => {
  it('joins provider and modelId with a slash', () => {
    expect(piProviderModelSelector(openaiCodex)).toBe('openai-codex/gpt-5.4');
  });
});

describe('getPiOptionDisplay', () => {
  it('uses modelName as primary text and provider label as secondary for resolved options', () => {
    expect(getPiOptionDisplay({
      provider: 'openai-codex',
      modelId: 'gpt-5.4',
      modelName: 'GPT-5.4',
      label: 'OpenAI Codex — GPT-5.4',
      safe: true,
    })).toEqual({ primary: 'GPT-5.4', secondary: 'OpenAI Codex' });
  });

  it('falls back to modelId as primary text for resolved options without modelName', () => {
    expect(getPiOptionDisplay({
      provider: 'openai-codex',
      modelId: 'gpt-5.4',
      label: 'OpenAI Codex — GPT-5.4',
      safe: true,
    })).toEqual({ primary: 'gpt-5.4', secondary: 'OpenAI Codex — GPT-5.4' });
  });

  it('uses the label as primary text for unresolved placeholders without modelName', () => {
    expect(getPiOptionDisplay({ provider: 'cursor', modelId: PI_UNRESOLVED_MODEL_ID, label: 'cursor', safe: false })).toEqual({
      primary: 'cursor',
    });
  });

  it('falls back to the full label as secondary when the resolved label does not end with the model suffix', () => {
    expect(getPiOptionDisplay({
      provider: 'openai-codex',
      modelId: 'gpt-5.4',
      modelName: 'GPT-5.4',
      label: 'OpenAI Codex (custom label)',
      safe: true,
    })).toEqual({ primary: 'GPT-5.4', secondary: 'OpenAI Codex (custom label)' });
  });

  it('suppresses secondary text when it duplicates primary text', () => {
    expect(getPiOptionDisplay({
      provider: 'openai-codex',
      modelId: 'gpt-5.4',
      modelName: 'GPT-5.4',
      label: 'GPT-5.4',
      safe: true,
    })).toEqual({ primary: 'GPT-5.4' });
  });
});

describe('findPiProviderOption', () => {
  it('finds the option matching a selector', () => {
    expect(findPiProviderOption([openaiCodex, cursor], 'cursor/cursor-default')).toEqual(cursor);
  });

  it('returns undefined for an unset selector', () => {
    expect(findPiProviderOption([openaiCodex, cursor], undefined)).toBeUndefined();
  });

  it('returns undefined when no option matches', () => {
    expect(findPiProviderOption([openaiCodex], 'cursor/cursor-default')).toBeUndefined();
  });
});

describe('pickDefaultPiProviderOption', () => {
  it('picks the first safe option', () => {
    expect(pickDefaultPiProviderOption([cursor, openaiCodex])).toEqual(openaiCodex);
  });

  it('never picks an unsafe option, even when it is the only one', () => {
    expect(pickDefaultPiProviderOption([cursor])).toBeUndefined();
  });

  it('returns undefined for an empty list', () => {
    expect(pickDefaultPiProviderOption([])).toBeUndefined();
  });
});

describe('requiresUnsafeAcknowledgment', () => {
  it('is false for a safe option', () => {
    expect(requiresUnsafeAcknowledgment(openaiCodex, new Set())).toBe(false);
  });

  it('is true for an unsafe option that has not been acknowledged', () => {
    expect(requiresUnsafeAcknowledgment(cursor, new Set())).toBe(true);
  });

  it('is false for an unsafe option that has already been acknowledged', () => {
    expect(requiresUnsafeAcknowledgment(cursor, new Set(['cursor']))).toBe(false);
  });

  it('is false when there is no option selected', () => {
    expect(requiresUnsafeAcknowledgment(undefined, new Set())).toBe(false);
  });
});

describe('withAcknowledgedProvider', () => {
  it('adds a provider to an empty set', () => {
    expect(withAcknowledgedProvider(new Set(), 'cursor')).toEqual(new Set(['cursor']));
  });

  it('preserves existing entries', () => {
    expect(withAcknowledgedProvider(new Set(['other']), 'cursor')).toEqual(new Set(['other', 'cursor']));
  });

  it('returns the same set instance when already acknowledged', () => {
    const acknowledged = new Set(['cursor']);
    expect(withAcknowledgedProvider(acknowledged, 'cursor')).toBe(acknowledged);
  });
});
