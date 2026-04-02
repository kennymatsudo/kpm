import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileWatchService } from '../../src/main/services/files';

describe('FileWatchService context listing', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-file-watch-'));
    FileWatchService.init({
      getProjectById: (projectId) => projectId === 'project-1'
        ? {
            id: 'project-1',
            name: 'Test Project',
            folder_path: tempDir,
            phase: 'discovery',
            session_tokens: 0,
            session_input_tokens: 0,
            session_output_tokens: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        : undefined,
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('hides CLAUDE.md when AGENTS.md exists', async () => {
    fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), '# Agents', 'utf-8');
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Claude', 'utf-8');
    fs.writeFileSync(path.join(tempDir, 'notes.md'), '# Notes', 'utf-8');

    const result = await FileWatchService.listContextFiles('project-1');

    expect(result.success).toBe(true);
    expect(result.files?.map(file => file.name)).toEqual(['AGENTS.md', 'notes.md']);
  });

  it('shows CLAUDE.md when it is the only context file', async () => {
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Claude', 'utf-8');

    const result = await FileWatchService.listContextFiles('project-1');

    expect(result.success).toBe(true);
    expect(result.files?.map(file => file.name)).toEqual(['CLAUDE.md']);
  });
});
