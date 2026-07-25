import { describe, it, expect } from 'vitest';
import { formatModel } from './usageFormatters';

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
});
