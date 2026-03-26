import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOnboardingService } from '../../src/main/services/generation/OnboardingService';

describe('OnboardingService', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    vi.restoreAllMocks();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('writes AGENTS.md to the project folder when saving context succeeds', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-onboarding-'));
    const service = createOnboardingService({
      getReposByProject: () => [],
      getProjectFolder: () => tempDir,
    });

    const result = service.saveContext('project-1', '# Project Context');

    expect(result).toEqual({ success: true });
    expect(fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8')).toBe('# Project Context');
  });

  it('returns an error when the project folder is unavailable', () => {
    const service = createOnboardingService({
      getReposByProject: () => [],
      getProjectFolder: () => null,
    });

    const result = service.saveContext('project-1', '# Project Context');

    expect(result).toEqual({ success: false, error: 'Project folder not found' });
  });
});
