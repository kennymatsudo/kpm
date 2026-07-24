import { describe, expect, it } from 'vitest';
import type { ChatChoiceView, ChatProvider, CodexChatModel } from '../../../shared/types';
import { resolveSessionDisplayModel } from './sessionModel';

function makeChoice(provider: ChatProvider, model: string): ChatChoiceView {
  return {
    revision: 1,
    selected: { provider, model, effort: null },
    remembered: {} as ChatChoiceView['remembered'],
    providers: [],
    controlsEnabled: true,
    responding: false,
    send: { allowed: true },
  };
}

describe('resolveSessionDisplayModel', () => {
  it('returns choice.selected.model for a claude session, even when the legacy mirror differs', () => {
    const session = {
      choice: makeChoice('claude', 'opus'),
      provider: 'claude',
      model: 'sonnet',
      codexModel: 'gpt-5.6-sol',
      piProviderModel: undefined,
    } as const;
    expect(resolveSessionDisplayModel(session)).toBe('opus');
  });

  it('returns choice.selected.model for a codex session, even when the legacy mirror differs', () => {
    const session = {
      choice: makeChoice('codex', 'gpt-5.6-terra'),
      provider: 'codex',
      model: 'sonnet',
      codexModel: 'gpt-5.6-sol',
      piProviderModel: undefined,
    } as const;
    expect(resolveSessionDisplayModel(session)).toBe('gpt-5.6-terra');
  });

  it('returns choice.selected.model for a pi session, even when the legacy mirror differs', () => {
    const session = {
      choice: makeChoice('pi', 'openai-codex/gpt-5.4'),
      provider: 'pi',
      model: 'sonnet',
      codexModel: 'gpt-5.6-sol',
      piProviderModel: 'cursor/cursor-default',
    } as const;
    expect(resolveSessionDisplayModel(session)).toBe('openai-codex/gpt-5.4');
  });

  it('falls back to piProviderModel when choice is null and provider is pi with piProviderModel set', () => {
    const session = {
      choice: null,
      provider: 'pi',
      model: 'sonnet',
      codexModel: 'gpt-5.6-sol',
      piProviderModel: 'cursor/cursor-default',
    } as const;
    expect(resolveSessionDisplayModel(session)).toBe('cursor/cursor-default');
  });

  it('falls back to model when choice is null and provider is pi with piProviderModel undefined', () => {
    const session = {
      choice: null,
      provider: 'pi',
      model: 'sonnet',
      codexModel: 'gpt-5.6-sol',
      piProviderModel: undefined,
    } as const;
    expect(resolveSessionDisplayModel(session)).toBe('sonnet');
  });

  it('falls back to codexModel when choice is null and provider is codex with codexModel set', () => {
    const session = {
      choice: null,
      provider: 'codex',
      model: 'sonnet',
      codexModel: 'gpt-5.6-sol',
      piProviderModel: undefined,
    } as const;
    expect(resolveSessionDisplayModel(session)).toBe('gpt-5.6-sol');
  });

  it('falls back to model when choice is null and provider is codex with codexModel empty', () => {
    const session = {
      choice: null,
      provider: 'codex',
      model: 'sonnet',
      codexModel: '' as CodexChatModel,
      piProviderModel: undefined,
    } as const;
    expect(resolveSessionDisplayModel(session)).toBe('sonnet');
  });

  it('falls back to model when choice is null and provider is claude', () => {
    const session = {
      choice: null,
      provider: 'claude',
      model: 'sonnet',
      codexModel: 'gpt-5.6-sol',
      piProviderModel: undefined,
    } as const;
    expect(resolveSessionDisplayModel(session)).toBe('sonnet');
  });
});
