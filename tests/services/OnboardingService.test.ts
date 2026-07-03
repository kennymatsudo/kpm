import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOnboardingService } from '../../src/main/services/generation/OnboardingService';
import type { IProjectRepository } from '../../src/main/db/interfaces';

const unusedProjectsRepo = {} as IProjectRepository;

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
      projects: unusedProjectsRepo,
    });

    const result = service.saveContext('project-1', '# Project Context');

    expect(result).toEqual({ success: true });
    expect(fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8')).toBe('# Project Context');
    expect(fs.existsSync(path.join(tempDir, 'CLAUDE.md'))).toBe(true);
  });

  it('returns an error when the project folder is unavailable', () => {
    const service = createOnboardingService({
      getReposByProject: () => [],
      getProjectFolder: () => null,
      projects: unusedProjectsRepo,
    });

    const result = service.saveContext('project-1', '# Project Context');

    expect(result).toEqual({ success: false, error: 'Project folder not found' });
  });

  it('starts generation in the project workspace, mounts connected repos, and strips preamble text', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-onboarding-'));
    const projectDir = path.join(tempDir, 'project');
    const repoDir = path.join(tempDir, 'repo-a');

    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(repoDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Repo A\n');

    const queryFn = vi.fn(async function* () {
      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: 'Based on the scanned repository data provided, I have enough information.\n\n# Support Pane\n\nActual content',
            },
          ],
        },
      };
    });

    const service = createOnboardingService({
      getReposByProject: () => [{ id: 'repo-1', path: repoDir }],
      getProjectFolder: () => projectDir,
      queryFn: queryFn as never,
      getTimeoutMs: () => 1000,
      projects: unusedProjectsRepo,
    });

    const completion = new Promise<string>((resolve, reject) => {
      void service.scanAndGenerate(
        {
          projectId: 'project-1',
          projectName: 'Support Pane',
          projectPath: projectDir,
          repoDirectories: {},
        },
        {
          onProgress: vi.fn(),
          onThinking: vi.fn(),
          onComplete: resolve,
          onError: reject,
        },
      );
    });

    await expect(completion).resolves.toBe('# Support Pane\n\nActual content');
    expect(queryFn).toHaveBeenCalledTimes(1);

    const [queryArgs] = queryFn.mock.calls[0] as unknown as [{ options: { cwd?: string; additionalDirectories?: string[] } }];
    expect(queryArgs.options.cwd).toBe(projectDir);
    expect(queryArgs.options.additionalDirectories).toEqual([repoDir]);
  });
});
