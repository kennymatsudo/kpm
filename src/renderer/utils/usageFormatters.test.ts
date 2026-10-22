import { describe, it, expect } from 'vitest';
import { formatAggregateCost, formatCurrency } from './usageFormatters';

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

describe('formatAggregateCost', () => {
  it('shows a dash for a row made only of unpriced runs, since its $0 is unknown', () => {
    expect(formatAggregateCost({ cost_micro_usd: 0, events: 3, unpriced_events: 3 })).toBe('—');
  });

  it('shows the priced share of a mixed row', () => {
    expect(formatAggregateCost({ cost_micro_usd: 1_250_000, events: 3, unpriced_events: 1 })).toBe('$1.25');
  });
});
