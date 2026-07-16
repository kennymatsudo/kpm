import { describe, expect, it } from 'vitest';
import { resolveDefaultModel, type DefaultModelInputs } from './modelDefault';

const base: DefaultModelInputs = {
  provider: 'claude',
  claudeModel: 'sonnet',
  codexModel: 'gpt-5.6-sol',
  piProviderModel: null,
};

describe('resolveDefaultModel', () => {
  it('maps the claude pick to its claude model', () => {
    expect(resolveDefaultModel({ ...base, provider: 'claude', claudeModel: 'opus' }))
      .toEqual({ provider: 'claude', model: 'opus' });
  });

  it('maps the codex pick to its codex model', () => {
    expect(resolveDefaultModel({ ...base, provider: 'codex', codexModel: 'gpt-5.6-terra' }))
      .toEqual({ provider: 'codex', model: 'gpt-5.6-terra' });
  });

  it('takes the model half of a pi selector', () => {
    expect(resolveDefaultModel({ ...base, provider: 'pi', piProviderModel: 'openai/gpt-4o' }))
      .toEqual({ provider: 'pi', model: 'gpt-4o' });
  });

  it('falls back to auto for an unset pi selector', () => {
    expect(resolveDefaultModel({ ...base, provider: 'pi', piProviderModel: null }))
      .toEqual({ provider: 'pi', model: 'auto' });
  });

  it('keeps a slashless pi selector verbatim', () => {
    expect(resolveDefaultModel({ ...base, provider: 'pi', piProviderModel: 'auto' }))
      .toEqual({ provider: 'pi', model: 'auto' });
  });
});
