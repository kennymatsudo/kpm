import { describe, expect, it } from 'vitest';
import { addSoftBreaks } from './markdown';

describe('addSoftBreaks', () => {
  it('reflows a paragraph the author hard-wrapped at 80 columns', () => {
    const source = [
      'How Klaviyo support runs inside Composer, why the design looks the way it does,',
      'and where each piece lives in code.',
    ].join('\n');

    expect(addSoftBreaks(source)).toBe(source);
  });

  it('keeps the line endings of a metadata block', () => {
    const source = ['Author: Kenny', 'Status: Draft', 'Updated: 2026-08-10'].join('\n');

    expect(addSoftBreaks(source)).toBe(
      'Author: Kenny  \nStatus: Draft  \nUpdated: 2026-08-10'
    );
  });

  it('judges a wrapped paragraph as a whole rather than per inline-code fragment', () => {
    const source = [
      'Behavior described here is the intended design. Confirm it against `origin/main`',
      'in `k-repo` before assuming it is live, because a local checkout parked on a',
      'feature branch will happily tell you a different story.',
    ].join('\n');

    expect(addSoftBreaks(source)).toBe(source);
  });

  it('decides each paragraph separately', () => {
    const source = [
      'Author: Kenny',
      'Status: Draft',
      '',
      'This paragraph was hard-wrapped by an editor at eighty columns, so its own',
      'line endings carry no meaning at all.',
    ].join('\n');

    expect(addSoftBreaks(source)).toBe(
      [
        'Author: Kenny  ',
        'Status: Draft',
        '',
        'This paragraph was hard-wrapped by an editor at eighty columns, so its own',
        'line endings carry no meaning at all.',
      ].join('\n')
    );
  });

  it('leaves fenced code untouched', () => {
    const source = ['```ts', 'const a = 1;', 'const b = 2;', '```'].join('\n');

    expect(addSoftBreaks(source)).toBe(source);
  });
});
