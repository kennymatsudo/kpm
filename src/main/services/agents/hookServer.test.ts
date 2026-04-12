import { describe, expect, it } from 'vitest';
import { parseHookSessionId } from './hookServer';

describe('hookServer', () => {
  it('accepts review session hook paths with a -review suffix', () => {
    expect(parseHookSessionId('/hook/123e4567-e89b-12d3-a456-426614174000-review'))
      .toBe('123e4567-e89b-12d3-a456-426614174000-review');
  });

  it('rejects unrelated hook paths', () => {
    expect(parseHookSessionId('/hook/not/valid')).toBeNull();
    expect(parseHookSessionId('/nope/123')).toBeNull();
  });
});
