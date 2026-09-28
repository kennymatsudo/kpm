import { describe, expect, it } from 'vitest';
import { resolveModelPricing } from './claudePricing';

describe('resolveModelPricing', () => {
  it.each([
    ['claude-fable-5-1', 10, 50, 0.25],
    ['claude-mythos-5-1', 10, 50, 0.25],
    ['claude-fable-5', 10, 50, 1.0],
    ['claude-opus-5-5', 4, 20, 0.2],
    ['claude-opus-5', 5, 25, 0.5],
    ['claude-opus-4-8', 5, 25, 0.5],
    ['claude-sonnet-5-5', 2, 10, 0.2],
    ['claude-sonnet-5', 2, 10, 0.2],
    ['claude-sonnet-4-6', 3, 15, 0.3],
    ['claude-haiku-4-5-20251001', 1, 5, 0.1],
    ['opus', 4, 20, 0.2],
    ['sonnet', 2, 10, 0.2],
    ['some-unknown-model', 2, 10, 0.2],
  ])('prices %s at its own rates', (model, input, output, cacheRead) => {
    const { pricing } = resolveModelPricing(model);
    expect(pricing).toEqual({ input, output, cacheWrite: input * 1.25, cacheRead });
  });
});
