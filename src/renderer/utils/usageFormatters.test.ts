import { describe, it, expect } from 'vitest';
import { formatCurrency } from './usageFormatters';

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
