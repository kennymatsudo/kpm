import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  classifyPushTarget,
  hasUpstream,
  normalizeHeadRef,
  protectedBranchReason,
  resolveBaseBranch,
  resolveCurrentBranch,
  resolveDefaultBranch,
} from './branchFacts';

const gitExecCaptured = vi.fn();

vi.mock('./gitUtils', () => ({
  gitExecCaptured: (...args: unknown[]) => gitExecCaptured(...args),
}));

const REPO = '/repos/kpm';

function ok(stdout: string) {
  return { stdout, stderr: '', exitCode: 0 };
}
const fails = { stdout: '', stderr: 'fatal', exitCode: 128 };

beforeEach(() => vi.clearAllMocks());

describe('normalizeHeadRef', () => {
  it('names the branch a HEAD ref points at', () => {
    expect(normalizeHeadRef('ref: refs/heads/feature/add-thing\n')).toBe('feature/add-thing');
  });

  it('keeps a ref that is not under refs/heads', () => {
    expect(normalizeHeadRef('ref: refs/remotes/origin/main')).toBe('refs/remotes/origin/main');
  });

  it.each([
    ['a detached HEAD holding a commit', '9f2c1ab5d3e4f60718293a4b5c6d7e8f90123456'],
    ['an empty file', '   '],
    ['a ref with nothing after it', 'ref:'],
  ])('reports no branch for %s', (_case, contents) => {
    expect(normalizeHeadRef(contents)).toBeNull();
  });
});

describe('resolveCurrentBranch', () => {
  it('returns the checked-out branch', async () => {
    gitExecCaptured.mockResolvedValue(ok('feature/add-thing\n'));
    await expect(resolveCurrentBranch(REPO)).resolves.toBe('feature/add-thing');
  });

  it.each([
    ['detached HEAD', ok('HEAD\n')],
    ['an unborn branch', fails],
  ])('reports no branch on %s, matching normalizeHeadRef', async (_case, result) => {
    gitExecCaptured.mockResolvedValue(result);
    await expect(resolveCurrentBranch(REPO)).resolves.toBeNull();
  });
});

describe('resolveDefaultBranch', () => {
  it('prefers what the clone recorded for origin/HEAD', async () => {
    gitExecCaptured.mockResolvedValue(ok('refs/remotes/origin/trunk\n'));
    await expect(resolveDefaultBranch(REPO)).resolves.toBe('trunk');
  });

  it('falls back to master when origin/HEAD is absent and main does not exist', async () => {
    gitExecCaptured
      .mockResolvedValueOnce(fails)
      .mockResolvedValueOnce(fails)
      .mockResolvedValueOnce(ok('abc123'));
    await expect(resolveDefaultBranch(REPO)).resolves.toBe('master');
  });

  it('falls back to main in a repo with no branches at all', async () => {
    gitExecCaptured.mockResolvedValue(fails);
    await expect(resolveDefaultBranch(REPO)).resolves.toBe('main');
  });
});

describe('resolveBaseBranch', () => {
  it('keeps a declared branch that exists', async () => {
    gitExecCaptured.mockResolvedValue(ok('abc123'));
    await expect(resolveBaseBranch(REPO, 'release-2')).resolves.toBe('release-2');
  });

  it('falls back to the default branch when the declared one is gone', async () => {
    gitExecCaptured
      .mockResolvedValueOnce(fails)
      .mockResolvedValueOnce(ok('refs/remotes/origin/trunk'));
    await expect(resolveBaseBranch(REPO, 'main')).resolves.toBe('trunk');
  });
});

describe('protectedBranchReason', () => {
  it('flags a protected name without asking git', async () => {
    await expect(protectedBranchReason(REPO, 'develop')).resolves.toBe('protectedName');
    expect(gitExecCaptured).not.toHaveBeenCalled();
  });

  it("flags the repo's own default branch even when it is not a protected name", async () => {
    gitExecCaptured.mockResolvedValue(ok('refs/remotes/origin/trunk'));
    await expect(protectedBranchReason(REPO, 'trunk')).resolves.toBe('defaultBranch');
  });

  it('clears an ordinary feature branch', async () => {
    gitExecCaptured.mockResolvedValue(ok('refs/remotes/origin/main'));
    await expect(protectedBranchReason(REPO, 'feature/add-thing')).resolves.toBeNull();
  });
});

describe('classifyPushTarget', () => {
  it('accepts a feature branch', async () => {
    gitExecCaptured.mockResolvedValue(ok('refs/remotes/origin/main'));
    await expect(classifyPushTarget(REPO, 'feature/add-thing')).resolves.toEqual({
      ok: true,
      branch: 'feature/add-thing',
    });
  });

  it.each(['main', 'master', 'develop', 'release'])('refuses the protected branch %s', async (branch) => {
    const check = await classifyPushTarget(REPO, branch);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/protected branch/);
  });

  it('refuses a default branch that is not on the protected list', async () => {
    gitExecCaptured.mockResolvedValue(ok('refs/remotes/origin/trunk'));
    const check = await classifyPushTarget(REPO, 'trunk');
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/default branch/);
  });

  it.each([null, '', 'HEAD'])('refuses a missing branch (%s)', async (branch) => {
    const check = await classifyPushTarget(REPO, branch);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/detached/);
  });
});

describe('hasUpstream', () => {
  it('is true when the branch has an upstream', async () => {
    gitExecCaptured.mockResolvedValue(ok('origin/feature/add-thing'));
    await expect(hasUpstream(REPO, 'feature/add-thing')).resolves.toBe(true);
  });

  it('is false when git cannot resolve one', async () => {
    gitExecCaptured.mockResolvedValue(fails);
    await expect(hasUpstream(REPO, 'feature/add-thing')).resolves.toBe(false);
  });
});
