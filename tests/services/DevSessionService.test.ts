import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'child_process';
import { createDevSessionService } from '../../src/main/services/repo/DevSessionService';
import { createExecFileMock } from '../mocks/git';

const mockExecFile = vi.mocked(execFile);

function createDeps(session: Record<string, unknown>, repoPath: string) {
  return {
    devSessions: {
      get: vi.fn((id: string) => (id === session.id ? session : undefined)),
      getByProject: vi.fn(() => []),
      getByProjectWithPlanItems: vi.fn(() => []),
      getActiveSessions: vi.fn(() => []),
      getByPlanItem: vi.fn(),
      getActiveByPlanItem: vi.fn(),
      create: vi.fn(),
      updateStatus: vi.fn(),
      updateAutomationPhase: vi.fn(),
      updateModes: vi.fn(),
      updatePrInfo: vi.fn(),
      updateName: vi.fn(),
      delete: vi.fn(),
      markActiveAsInactive: vi.fn(),
    },
    planItems: {
      get: vi.fn(),
      getChildren: vi.fn(() => []),
      getByProject: vi.fn(() => []),
      updateStatus: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getParentChain: vi.fn(() => []),
    },
    projects: {
      get: vi.fn(),
    },
    repos: {
      getById: vi.fn(() => ({
        id: 'repo-1',
        project_id: 'project-1',
        path: repoPath,
        created_at: new Date().toISOString(),
      })),
      getByProject: vi.fn(() => []),
    },
    appSettings: {
      get: vi.fn(),
    },
    agentPrompts: {
      getEffectivePromptPack: vi.fn(),
      getPromptPack: vi.fn(),
    },
    agentReviews: {
      getLatestByImplementationSessionIds: vi.fn(() => []),
      persistStartedReview: vi.fn(),
      persistCompletedReview: vi.fn(),
      persistFailedReview: vi.fn(),
      markLatestCompletedStale: vi.fn(),
    },
    agentSessionManager: {
      create: vi.fn(),
      getByDevSession: vi.fn(),
    },
    userDataPath: '/tmp/kpm-test',
  } as unknown as Parameters<typeof createDevSessionService>[0];
}

describe('DevSessionService', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
    vi.clearAllMocks();
  });

  it('filters current upstream commits from the session commit log', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-dev-session-'));
    const repoPath = path.join(tempDir, 'repo');
    const worktreePath = path.join(tempDir, '.kpm-worktrees', 'repo', 'feature-branch');

    fs.mkdirSync(repoPath, { recursive: true });
    fs.mkdirSync(worktreePath, { recursive: true });

    const session = {
      id: 'session-1',
      project_id: 'project-1',
      plan_item_id: 'plan-1',
      repo_id: 'repo-1',
      worktree_path: worktreePath,
      branch_name: 'feature-branch',
      base_branch: 'main',
      base_sha: 'old-base',
      status: 'inactive',
      agent_type: 'claude',
      automation_phase: null,
      initial_instructions: '',
      pr_number: null,
      pr_url: null,
      pr_state: null,
      review_state: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };

    mockExecFile.mockImplementation(createExecFileMock({
      onCall: (args) => {
        if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref' && args[2] === 'main@{u}') {
          return { stdout: 'origin/main\n', stderr: '' };
        }
        if (args[0] === 'rev-parse' && args[1] === '--verify' && args[2] === 'origin/main') {
          return { stdout: 'origin/main\n', stderr: '' };
        }
        if (args[0] === 'log') {
          return { stdout: '', stderr: '' };
        }
        if (args[0] === 'rev-list') {
          return { stdout: '0\n', stderr: '' };
        }
        return new Error(`Unexpected git call: ${args.join(' ')}`);
      },
    }) as never);

    const service = createDevSessionService(createDeps(session, repoPath));

    const logResult = await service.getSessionCommitLog('session-1');
    expect(logResult.ok).toBe(true);
    if (logResult.ok) {
      expect(logResult.data).toEqual([]);
    }

    const countResult = await service.getCommitsAhead('session-1');
    expect(countResult.ok).toBe(true);
    if (countResult.ok) {
      expect(countResult.data).toBe(0);
    }

    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['log', 'old-base..HEAD', '--not', 'origin/main', expect.stringMatching(/^--format=/)],
      expect.objectContaining({ cwd: worktreePath }),
      expect.any(Function)
    );
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['rev-list', '--count', 'old-base..HEAD', '--not', 'origin/main'],
      expect.objectContaining({ cwd: worktreePath }),
      expect.any(Function)
    );
  });

  it('commits from the session worktree on the session branch', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-dev-session-'));
    const repoPath = path.join(tempDir, 'repo');
    const worktreePath = path.join(tempDir, '.kpm-worktrees', 'repo', 'feature-branch');

    fs.mkdirSync(repoPath, { recursive: true });
    fs.mkdirSync(worktreePath, { recursive: true });

    const session = {
      id: 'session-1',
      project_id: 'project-1',
      plan_item_id: 'plan-1',
      repo_id: 'repo-1',
      worktree_path: worktreePath,
      branch_name: 'feature-branch',
      base_branch: 'main',
      status: 'inactive',
      agent_type: 'claude',
      automation_phase: null,
      initial_instructions: '',
      requested_mode: 'solo',
      effective_mode: null,
      pr_number: null,
      pr_url: null,
      pr_state: null,
      review_state: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };

    mockExecFile.mockImplementation(createExecFileMock({
      onCall: (args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
          return { stdout: `${worktreePath}\n`, stderr: '' };
        }
        if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
          return { stdout: 'feature-branch\n', stderr: '' };
        }
        if (args[0] === 'add') {
          return { stdout: '', stderr: '' };
        }
        if (args[0] === 'commit') {
          return { stdout: '[feature-branch abc1234] Test commit\n', stderr: '' };
        }
        return new Error(`Unexpected git call: ${args.join(' ')}`);
      },
    }) as never);

    const service = createDevSessionService(createDeps(session, repoPath));
    const result = await service.commitSessionChanges('session-1', 'Test commit');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.sha).toBe('abc1234');
    }
    const resolvedWorktreePath = fs.realpathSync(worktreePath);
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['add', '-A'],
      expect.objectContaining({ cwd: resolvedWorktreePath }),
      expect.any(Function)
    );
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['commit', '-m', 'Test commit'],
      expect.objectContaining({ cwd: resolvedWorktreePath }),
      expect.any(Function)
    );
    expect(mockExecFile).not.toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['commit']),
      expect.objectContaining({ cwd: repoPath }),
      expect.any(Function)
    );
  });

  it('returns hook output without retrying when hooks fail without changing files', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-dev-session-'));
    const repoPath = path.join(tempDir, 'repo');
    const worktreePath = path.join(tempDir, '.kpm-worktrees', 'repo', 'feature-branch');

    fs.mkdirSync(repoPath, { recursive: true });
    fs.mkdirSync(worktreePath, { recursive: true });

    const session = {
      id: 'session-1',
      project_id: 'project-1',
      plan_item_id: 'plan-1',
      repo_id: 'repo-1',
      worktree_path: worktreePath,
      branch_name: 'feature-branch',
      base_branch: 'main',
      status: 'inactive',
      agent_type: 'claude',
      automation_phase: null,
      initial_instructions: '',
      requested_mode: 'solo',
      effective_mode: null,
      pr_number: null,
      pr_url: null,
      pr_state: null,
      review_state: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };

    let commitCalls = 0;
    let addCalls = 0;
    const hookError = Object.assign(
      new Error('Command failed: git commit -m Test commit'),
      {
        stderr: [
          'services/example_service/tests/test_example_service.py:3119: error: Returning Any from function declared to return "dict[Any, Any]"  [no-any-return]',
          'Found 1 error in 1 file (checked 4 source files)',
          '',
          'mypy failed.',
        ].join('\n'),
        stdout: '',
      },
    );

    mockExecFile.mockImplementation(createExecFileMock({
      onCall: (args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
          return { stdout: `${worktreePath}\n`, stderr: '' };
        }
        if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
          return { stdout: 'feature-branch\n', stderr: '' };
        }
        if (args[0] === 'add') {
          addCalls++;
          return { stdout: '', stderr: '' };
        }
        if (args[0] === 'commit') {
          commitCalls++;
          return hookError;
        }
        if (args[0] === 'status' && args[1] === '--porcelain') {
          return { stdout: 'M  python/example.py\n', stderr: '' };
        }
        return new Error(`Unexpected git call: ${args.join(' ')}`);
      },
    }) as never);

    const service = createDevSessionService(createDeps(session, repoPath));
    const result = await service.commitSessionChanges('session-1', 'Test commit');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Returning Any from function declared to return');
      expect(result.error).toContain('mypy failed');
      expect(result.error).not.toContain('Command failed: git commit');
    }
    expect(addCalls).toBe(1);
    expect(commitCalls).toBe(1);
  });

  it('retries once when a hook modifies the worktree before failing', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-dev-session-'));
    const repoPath = path.join(tempDir, 'repo');
    const worktreePath = path.join(tempDir, '.kpm-worktrees', 'repo', 'feature-branch');

    fs.mkdirSync(repoPath, { recursive: true });
    fs.mkdirSync(worktreePath, { recursive: true });

    const session = {
      id: 'session-1',
      project_id: 'project-1',
      plan_item_id: 'plan-1',
      repo_id: 'repo-1',
      worktree_path: worktreePath,
      branch_name: 'feature-branch',
      base_branch: 'main',
      status: 'inactive',
      agent_type: 'claude',
      automation_phase: null,
      initial_instructions: '',
      requested_mode: 'solo',
      effective_mode: null,
      pr_number: null,
      pr_url: null,
      pr_state: null,
      review_state: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };

    let commitCalls = 0;
    let addCalls = 0;
    const hookError = Object.assign(new Error('Hook formatted files'), {
      stderr: 'pre-commit formatted files',
      stdout: '',
    });

    mockExecFile.mockImplementation(createExecFileMock({
      onCall: (args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
          return { stdout: `${worktreePath}\n`, stderr: '' };
        }
        if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
          return { stdout: 'feature-branch\n', stderr: '' };
        }
        if (args[0] === 'add') {
          addCalls++;
          return { stdout: '', stderr: '' };
        }
        if (args[0] === 'status' && args[1] === '--porcelain') {
          return { stdout: 'MM src/example.ts\n', stderr: '' };
        }
        if (args[0] === 'commit') {
          commitCalls++;
          if (commitCalls === 1) {
            return hookError;
          }
          return { stdout: '[feature-branch def5678] Test commit\n', stderr: '' };
        }
        return new Error(`Unexpected git call: ${args.join(' ')}`);
      },
    }) as never);

    const service = createDevSessionService(createDeps(session, repoPath));
    const result = await service.commitSessionChanges('session-1', 'Test commit');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.sha).toBe('def5678');
    }
    expect(addCalls).toBe(2);
    expect(commitCalls).toBe(2);
  });

  it('refuses to commit when the session worktree resolves to the primary checkout', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-dev-session-'));
    const repoPath = path.join(tempDir, 'repo');

    fs.mkdirSync(repoPath, { recursive: true });

    const session = {
      id: 'session-1',
      project_id: 'project-1',
      plan_item_id: 'plan-1',
      repo_id: 'repo-1',
      worktree_path: repoPath,
      branch_name: 'feature-branch',
      base_branch: 'main',
      status: 'inactive',
      agent_type: 'claude',
      automation_phase: null,
      initial_instructions: '',
      requested_mode: 'solo',
      effective_mode: null,
      pr_number: null,
      pr_url: null,
      pr_state: null,
      review_state: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };

    mockExecFile.mockImplementation(createExecFileMock({
      onCall: (args) => new Error(`Unexpected git call: ${args.join(' ')}`),
    }) as never);

    const service = createDevSessionService(createDeps(session, repoPath));
    const result = await service.commitSessionChanges('session-1', 'Test commit');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Refusing task run: session worktree resolves to the primary checkout');
    }
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('refuses to commit when the session worktree is not on the session branch', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-dev-session-'));
    const repoPath = path.join(tempDir, 'repo');
    const worktreePath = path.join(tempDir, '.kpm-worktrees', 'repo', 'feature-branch');

    fs.mkdirSync(repoPath, { recursive: true });
    fs.mkdirSync(worktreePath, { recursive: true });

    const session = {
      id: 'session-1',
      project_id: 'project-1',
      plan_item_id: 'plan-1',
      repo_id: 'repo-1',
      worktree_path: worktreePath,
      branch_name: 'feature-branch',
      base_branch: 'main',
      status: 'inactive',
      agent_type: 'claude',
      automation_phase: null,
      initial_instructions: '',
      requested_mode: 'solo',
      effective_mode: null,
      pr_number: null,
      pr_url: null,
      pr_state: null,
      review_state: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };

    mockExecFile.mockImplementation(createExecFileMock({
      onCall: (args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
          return { stdout: `${worktreePath}\n`, stderr: '' };
        }
        if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
          return { stdout: 'main\n', stderr: '' };
        }
        return new Error(`Unexpected git call: ${args.join(' ')}`);
      },
    }) as never);

    const service = createDevSessionService(createDeps(session, repoPath));
    const result = await service.commitSessionChanges('session-1', 'Test commit');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("is on branch 'main', expected 'feature-branch'");
    }
    expect(mockExecFile).not.toHaveBeenCalledWith(
      'git',
      ['commit', '-m', 'Test commit'],
      expect.anything(),
      expect.any(Function)
    );
  });

  it('fails without detaching the main checkout when the branch is already checked out', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-dev-session-'));
    const repoPath = path.join(tempDir, 'repo');
    const worktreesDir = path.join(tempDir, '.kpm-worktrees', 'repo');
    const worktreePath = path.join(worktreesDir, 'feature-branch');

    fs.mkdirSync(repoPath, { recursive: true });
    fs.mkdirSync(worktreesDir, { recursive: true });

    const session = {
      id: 'session-1',
      project_id: 'project-1',
      plan_item_id: 'plan-1',
      repo_id: 'repo-1',
      worktree_path: worktreePath,
      branch_name: 'feature-branch',
      base_branch: 'main',
      status: 'pending',
      agent_type: 'claude',
      automation_phase: null,
      initial_instructions: '',
      requested_mode: 'solo',
      effective_mode: null,
      pr_number: null,
      pr_url: null,
      pr_state: null,
      review_state: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };

    mockExecFile.mockImplementation(createExecFileMock({
      onCall: (args) => {
        if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
          return { stdout: 'feature-branch\n', stderr: '' };
        }
        return new Error(`Unexpected git call: ${args.join(' ')}`);
      },
    }) as never);

    const service = createDevSessionService(createDeps(session, repoPath));
    const result = await service.startAgentSession('session-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Branch 'feature-branch' is currently checked out in the main repository.");
    }
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      expect.objectContaining({ cwd: repoPath }),
      expect.any(Function)
    );
  });
});
