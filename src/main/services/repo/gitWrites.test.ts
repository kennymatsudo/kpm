import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  deleteLocalBranch,
  deleteRemoteBranch,
  describePushFailure,
  publishBranch,
  type WriteAuthorization,
} from './gitWrites';

const gitExecCaptured = vi.fn();
const classifyPushTarget = vi.fn();
const protectedBranchReason = vi.fn();
const hasUpstream = vi.fn();
const access = vi.fn();

vi.mock('node:fs/promises', () => ({
  access: (...args: unknown[]) => access(...args),
  constants: { X_OK: 1 },
}));

vi.mock('./gitUtils', () => ({
  gitExecCaptured: (...args: unknown[]) => gitExecCaptured(...args),
}));

vi.mock('./branchFacts', () => ({
  classifyPushTarget: (...args: unknown[]) => classifyPushTarget(...args),
  protectedBranchReason: (...args: unknown[]) => protectedBranchReason(...args),
  hasUpstream: (...args: unknown[]) => hasUpstream(...args),
}));

const REPO = '/repos/kpm';
const BRANCH = 'feature/add-thing';

const boardSession: WriteAuthorization = { kind: 'boardSession' };

function chatGrant(allowed: boolean, reason = 'user said no') {
  const request = vi.fn(async () => (allowed ? { allowed: true } as const : { allowed: false, reason } as const));
  return { authorization: { kind: 'projectWriteGrant', request } as WriteAuthorization, request };
}

beforeEach(() => {
  vi.clearAllMocks();
  classifyPushTarget.mockResolvedValue({ ok: true, branch: BRANCH });
  protectedBranchReason.mockResolvedValue(null);
  hasUpstream.mockResolvedValue(true);
  gitExecCaptured.mockResolvedValue({ stdout: '', stderr: 'Everything up-to-date', exitCode: 0 });
  access.mockRejectedValue(new Error('ENOENT'));
});

describe('publishBranch', () => {
  it('pushes the branch to the named remote', async () => {
    const outcome = await publishBranch({ repoPath: REPO, remote: 'upstream', branch: BRANCH, authorization: boardSession });

    expect(outcome.ok).toBe(true);
    expect(gitExecCaptured).toHaveBeenCalledWith(['push', 'upstream', '--', BRANCH], { cwd: REPO });
  });

  it('sets the upstream when the branch has none', async () => {
    hasUpstream.mockResolvedValue(false);
    const outcome = await publishBranch({ repoPath: REPO, remote: 'origin', branch: BRANCH, authorization: boardSession });

    expect(outcome).toMatchObject({ ok: true, setUpstream: true });
    expect(gitExecCaptured).toHaveBeenCalledWith(
      ['push', '--set-upstream', 'origin', '--', BRANCH],
      { cwd: REPO }
    );
  });

  it('refuses a branch the push policy rejects, without asking for consent', async () => {
    classifyPushTarget.mockResolvedValue({ ok: false, reason: 'protected branch' });
    const { authorization, request } = chatGrant(true);

    const outcome = await publishBranch({ repoPath: REPO, remote: 'origin', branch: 'main', authorization });

    expect(outcome).toEqual({ ok: false, kind: 'refused', reason: 'protected branch' });
    expect(request).not.toHaveBeenCalled();
    expect(gitExecCaptured).not.toHaveBeenCalled();
  });

  it('does not push when the chat grant is denied', async () => {
    const { authorization } = chatGrant(false);

    const outcome = await publishBranch({ repoPath: REPO, remote: 'origin', branch: BRANCH, authorization });

    expect(outcome).toEqual({ ok: false, kind: 'refused', reason: 'user said no' });
    expect(gitExecCaptured).not.toHaveBeenCalled();
  });

  it('asks for the chat grant before running git', async () => {
    const { authorization, request } = chatGrant(true);
    const callOrder: string[] = [];
    request.mockImplementation(async () => {
      callOrder.push('consent');
      return { allowed: true } as const;
    });
    gitExecCaptured.mockImplementation(async () => {
      callOrder.push('git');
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    await publishBranch({ repoPath: REPO, remote: 'origin', branch: BRANCH, authorization });

    expect(callOrder).toEqual(['consent', 'git']);
  });

  it('reports a rejected push as a failure with git output', async () => {
    gitExecCaptured.mockResolvedValue({ stdout: '', stderr: '! [rejected] non-fast-forward', exitCode: 1 });

    const outcome = await publishBranch({ repoPath: REPO, remote: 'origin', branch: BRANCH, authorization: boardSession });

    expect(outcome).toMatchObject({ ok: false, kind: 'failed' });
    if (!outcome.ok) expect(outcome.reason).toMatch(/non-fast-forward/);
  });

  it('leads with a headline when the pre-push hook stopped the push', async () => {
    gitExecCaptured.mockImplementation(async (args: string[]) =>
      args[0] === 'rev-parse'
        ? { stdout: '.git/hooks/pre-push\n', stderr: '', exitCode: 0 }
        : { stdout: '', stderr: HOOK_REJECTED_OUTPUT, exitCode: 1 }
    );
    access.mockResolvedValue(undefined);

    const outcome = await publishBranch({ repoPath: REPO, remote: 'origin', branch: BRANCH, authorization: boardSession });

    expect(access).toHaveBeenCalledWith('/repos/kpm/.git/hooks/pre-push', 1);
    expect(outcome).toMatchObject({
      ok: false,
      kind: 'failed',
      reason: `The repo's pre-push hook rejected the push. Nothing was sent to origin.\n\n${HOOK_REJECTED_OUTPUT}`,
    });
  });

  it.each(['--upload-pack=sh', '-o', '', 'has space', '$(whoami)'])(
    'refuses the remote name %s that git would read as a flag',
    async (remote) => {
      const outcome = await publishBranch({ repoPath: REPO, remote, branch: BRANCH, authorization: boardSession });

      expect(outcome).toMatchObject({ ok: false, kind: 'refused' });
      expect(gitExecCaptured).not.toHaveBeenCalled();
    }
  );

  it('never passes a force flag', async () => {
    await publishBranch({ repoPath: REPO, remote: 'origin', branch: BRANCH, authorization: boardSession });

    const args = gitExecCaptured.mock.calls[0][0] as string[];
    expect(args.some((arg) => arg.startsWith('--force'))).toBe(false);
    expect(args).not.toContain('-f');
  });
});

// Real git output shapes, captured from `git push` against a local bare remote.
const HOOK_REJECTED_OUTPUT = "✕ black failed.\nerror: failed to push some refs to '/tmp/remote'";
const NON_FAST_FORWARD_OUTPUT = [
  'To /tmp/remote',
  ' ! [rejected]        feat -> feat (non-fast-forward)',
  "error: failed to push some refs to '/tmp/remote'",
  'hint: Updates were rejected because the tip of your current branch is behind',
].join('\n');

describe('describePushFailure', () => {
  it('names a pre-push hook rejection when a hook ran and the remote never answered', () => {
    expect(describePushFailure(HOOK_REJECTED_OUTPUT, 'origin', true)).toBe(
      "The repo's pre-push hook rejected the push. Nothing was sent to origin."
    );
  });

  it('does not blame a hook when none is installed', () => {
    expect(describePushFailure(HOOK_REJECTED_OUTPUT, 'origin', false)).toBeNull();
  });

  it('does not blame the hook for a connection failure', () => {
    const output = "fatal: 'nowhere' does not appear to be a git repository\nfatal: Could not read from remote repository.";
    expect(describePushFailure(output, 'origin', true)).toBeNull();
  });

  it('tells the user to integrate remote commits on a non-fast-forward', () => {
    expect(describePushFailure(NON_FAST_FORWARD_OUTPUT, 'origin', true)).toBe(
      "origin has commits this branch doesn't. Pull or rebase, then push again."
    );
  });

  it("passes through the remote's own rejection reason", () => {
    const output = 'To github.com:org/repo.git\n ! [remote rejected] feat -> feat (protected branch hook declined)\nerror: failed to push some refs';
    expect(describePushFailure(output, 'origin', true)).toBe(
      'origin rejected the push (protected branch hook declined).'
    );
  });
});

describe('deleteRemoteBranch', () => {
  it('deletes the branch on the remote', async () => {
    const outcome = await deleteRemoteBranch({ repoPath: REPO, remote: 'origin', branch: BRANCH, authorization: boardSession });

    expect(outcome.ok).toBe(true);
    expect(gitExecCaptured).toHaveBeenCalledWith(['push', 'origin', '--delete', '--', BRANCH], { cwd: REPO });
  });

  it('refuses to delete a protected or default branch', async () => {
    protectedBranchReason.mockResolvedValue('defaultBranch');

    const outcome = await deleteRemoteBranch({ repoPath: REPO, remote: 'origin', branch: 'trunk', authorization: boardSession });

    expect(outcome).toMatchObject({ ok: false, kind: 'refused' });
    expect(gitExecCaptured).not.toHaveBeenCalled();
  });

  it('separates an already-deleted ref from a real failure', async () => {
    gitExecCaptured.mockResolvedValue({
      stdout: '',
      stderr: "error: unable to delete 'gone': remote ref does not exist",
      exitCode: 1,
    });

    const outcome = await deleteRemoteBranch({ repoPath: REPO, remote: 'origin', branch: 'gone', authorization: boardSession });

    expect(outcome).toMatchObject({ ok: false, kind: 'missingRef' });
  });

  it('refuses when there is no branch to delete', async () => {
    const outcome = await deleteRemoteBranch({ repoPath: REPO, remote: 'origin', branch: null, authorization: boardSession });

    expect(outcome).toEqual({ ok: false, kind: 'refused', reason: 'No branch to delete.' });
    expect(gitExecCaptured).not.toHaveBeenCalled();
  });
});

describe('deleteLocalBranch', () => {
  it('force-deletes the branch', async () => {
    const outcome = await deleteLocalBranch({ repoPath: REPO, branch: BRANCH, authorization: boardSession });

    expect(outcome.ok).toBe(true);
    expect(gitExecCaptured).toHaveBeenCalledWith(['branch', '-D', '--', BRANCH], { cwd: REPO });
  });

  it('refuses a protected or default branch', async () => {
    protectedBranchReason.mockResolvedValue('protectedName');

    const outcome = await deleteLocalBranch({ repoPath: REPO, branch: 'main', authorization: boardSession });

    expect(outcome).toMatchObject({ ok: false, kind: 'refused' });
    expect(gitExecCaptured).not.toHaveBeenCalled();
  });

  it('reads a missing branch as missingRef, not a failure', async () => {
    gitExecCaptured.mockResolvedValue({ stdout: '', stderr: "error: branch 'gone' not found.", exitCode: 1 });

    const outcome = await deleteLocalBranch({ repoPath: REPO, branch: 'gone', authorization: boardSession });

    expect(outcome).toMatchObject({ ok: false, kind: 'missingRef' });
  });

  it('refuses when there is no branch to delete', async () => {
    const outcome = await deleteLocalBranch({ repoPath: REPO, branch: null, authorization: boardSession });

    expect(outcome).toEqual({ ok: false, kind: 'refused', reason: 'No branch to delete.' });
    expect(gitExecCaptured).not.toHaveBeenCalled();
  });
});
