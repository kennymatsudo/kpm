import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeProjectContextFile } from '../../src/main/project-context/projectContextFile';

describe('projectContextFile', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('writes AGENTS.md without creating a CLAUDE.md mirror', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-context-compat-'));

    await writeProjectContextFile(tempDir, '# Context');

    expect(fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8')).toBe('# Context');
    expect(fs.existsSync(path.join(tempDir, 'CLAUDE.md'))).toBe(false);
  });

  it('migrates a legacy CLAUDE.md-only workspace to AGENTS.md on write, leaving CLAUDE.md untouched', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-context-compat-'));
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Legacy', 'utf-8');

    await writeProjectContextFile(tempDir, '# Updated');

    expect(fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8')).toBe('# Updated');
    expect(fs.readFileSync(path.join(tempDir, 'CLAUDE.md'), 'utf-8')).toBe('# Legacy');
  });
});
