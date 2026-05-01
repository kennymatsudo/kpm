import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  writeProjectContextFiles,
  writeProjectContextFilesSync,
} from '../../src/main/project-context/contextFileCompat';

describe('contextFileCompat', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('writes AGENTS.md and creates a CLAUDE.md compatibility artifact', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-context-compat-'));

    await writeProjectContextFiles(tempDir, '# Context');

    expect(fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8')).toBe('# Context');
    expect(fs.existsSync(path.join(tempDir, 'CLAUDE.md'))).toBe(true);
  });

  it('migrates a legacy CLAUDE.md-only workspace to AGENTS.md on write', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-context-compat-'));
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Legacy', 'utf-8');

    await writeProjectContextFiles(tempDir, '# Updated');

    expect(fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8')).toBe('# Updated');
    expect(fs.readFileSync(path.join(tempDir, 'CLAUDE.md'), 'utf-8')).toBe('# Updated');
  });

  it('sync helper writes AGENTS.md and a compatibility alias when available', () => {
    const writtenFiles = new Map<string, string>();
    const symlinkedFiles = new Map<string, string>();

    writeProjectContextFilesSync({
      existsSync: (targetPath) => writtenFiles.has(targetPath) || symlinkedFiles.has(targetPath),
      writeFileSync: (targetPath, content) => {
        writtenFiles.set(targetPath, content);
      },
      unlinkSync: (targetPath) => {
        writtenFiles.delete(targetPath);
        symlinkedFiles.delete(targetPath);
      },
      symlinkSync: (target, targetPath) => {
        symlinkedFiles.set(targetPath, target);
      },
    }, '/tmp/project', '# Sync');

    expect(writtenFiles.get('/tmp/project/AGENTS.md')).toBe('# Sync');
    expect(symlinkedFiles.get('/tmp/project/CLAUDE.md')).toBe('AGENTS.md');
  });
});
