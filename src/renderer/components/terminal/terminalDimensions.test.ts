import { describe, expect, it } from 'vitest';
import { canResizeTerminal } from './terminalDimensions';

describe('canResizeTerminal', () => {
  it('rejects the tiny grids reported while a display is unavailable', () => {
    expect(canResizeTerminal({ cols: 2, rows: 18 }, true)).toBe(false);
    expect(canResizeTerminal({ cols: 80, rows: 1 }, true)).toBe(false);
  });

  it('rejects otherwise valid measurements while the document is hidden', () => {
    expect(canResizeTerminal({ cols: 120, rows: 30 }, false)).toBe(false);
  });

  it('accepts a usable visible terminal grid', () => {
    expect(canResizeTerminal({ cols: 120, rows: 30 }, true)).toBe(true);
  });

  it('rejects when there are no measurements yet', () => {
    expect(canResizeTerminal(undefined, true)).toBe(false);
  });

  it('treats the minimum grid size as inclusive', () => {
    expect(canResizeTerminal({ cols: 20, rows: 3 }, true)).toBe(true);
    expect(canResizeTerminal({ cols: 19, rows: 3 }, true)).toBe(false);
    expect(canResizeTerminal({ cols: 20, rows: 2 }, true)).toBe(false);
  });
});
