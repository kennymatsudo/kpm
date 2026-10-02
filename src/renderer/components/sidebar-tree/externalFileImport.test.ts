import { describe, expect, it } from 'vitest';
import { MAX_EXTERNAL_FILE_BYTES, MAX_TEXT_FILE_BYTES, planExternalFileImport } from './externalFileImport';

const MB = 1024 * 1024;

describe('planExternalFileImport', () => {
  it('copies a text file over the createFile limit by its disk path', () => {
    expect(planExternalFileImport({ size: 20 * MB }, '/Users/me/big.log', true))
      .toEqual({ kind: 'copy', sourcePath: '/Users/me/big.log' });
  });

  it('reads a small text file as text even when it has a path', () => {
    expect(planExternalFileImport({ size: 1024 }, '/Users/me/notes.md', true)).toEqual({ kind: 'text' });
  });

  it('copies a binary file by path and sends its bytes only when there is none', () => {
    expect(planExternalFileImport({ size: 1024 }, '/Users/me/a.png', false).kind).toBe('copy');
    expect(planExternalFileImport({ size: 1024 }, null, false)).toEqual({ kind: 'binary' });
  });

  it('explains a skip rather than dropping the file silently', () => {
    expect(planExternalFileImport({ size: MAX_TEXT_FILE_BYTES + 1 }, null, true).kind).toBe('skip');
    const tooBig = planExternalFileImport({ size: MAX_EXTERNAL_FILE_BYTES + 1 }, '/Users/me/huge.bin', false);
    expect(tooBig).toMatchObject({ kind: 'skip', reason: expect.stringContaining('Max 50.0 MB') });
  });
});
