import { describe, it, expect } from 'vitest';
import { formatCurrency, formatModel } from './usageFormatters';

describe('formatCurrency', () => {
  it('formats zero as $0.00', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('rounds to 2 decimals once the amount reaches a cent', () => {
    expect(formatCurrency(1_230_000)).toBe('$1.23');
  });

  it('extends to 4 decimals for sub-cent amounts so they do not round to $0.00', () => {
    expect(formatCurrency(2_300)).toBe('$0.0023');
  });
});

describe('formatModel', () => {
  it('labels SDK aliases', () => {
    expect(formatModel('opus')).toBe('Opus');
    expect(formatModel('sonnet')).toBe('Sonnet');
  });

  it('labels major-only model ids', () => {
    expect(formatModel('claude-opus-5')).toBe('Opus 5');
    expect(formatModel('claude-sonnet-5')).toBe('Sonnet 5');
  });

  it('labels major.minor model ids', () => {
    expect(formatModel('claude-opus-4-8')).toBe('Opus 4.8');
    expect(formatModel('claude-haiku-4-5')).toBe('Haiku 4.5');
  });

  it('labels pi provider selectors', () => {
    expect(formatModel('cursor/opus-latest@1m')).toBe('cursor · opus-latest@1m');
  });

  it('uppercases the gpt prefix on Codex model ids', () => {
    expect(formatModel('gpt-5-codex')).toBe('GPT-5-codex');
  });
});
