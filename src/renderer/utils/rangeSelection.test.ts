import { describe, expect, it } from 'vitest';
import { getContiguousRange } from './rangeSelection';

describe('getContiguousRange', () => {
  const orderedIds = ['a', 'b', 'c', 'd'];

  it('returns an inclusive forward range', () => {
    expect(getContiguousRange(orderedIds, 'b', 'd')).toEqual(['b', 'c', 'd']);
  });

  it('returns an inclusive reverse range', () => {
    expect(getContiguousRange(orderedIds, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });

  it('returns a single-item range when anchor and target match', () => {
    expect(getContiguousRange(orderedIds, 'c', 'c')).toEqual(['c']);
  });

  it('returns null when there is no usable anchor', () => {
    expect(getContiguousRange(orderedIds, null, 'c')).toBeNull();
    expect(getContiguousRange(orderedIds, 'missing', 'c')).toBeNull();
  });

  it('returns null when the target is not in the current order', () => {
    expect(getContiguousRange(orderedIds, 'a', 'missing')).toBeNull();
  });
});
