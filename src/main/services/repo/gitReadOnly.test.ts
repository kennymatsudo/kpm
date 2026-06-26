import { describe, it, expect } from 'vitest';
import { classifyGitInvocation, READ_GIT_SUBCOMMANDS } from './gitReadOnly';

function ok(subcommand: string, args: string[] = []): boolean {
  return classifyGitInvocation(subcommand, args).ok;
}

describe('classifyGitInvocation', () => {
  it('allows plain read subcommands', () => {
    expect(ok('status', ['--short'])).toBe(true);
    expect(ok('log', ['--oneline', '-20', 'origin/main..HEAD'])).toBe(true);
    expect(ok('diff', ['HEAD~3', 'HEAD', '--stat'])).toBe(true);
    expect(ok('show', ['abc123'])).toBe(true);
    expect(ok('blame', ['src/file.ts'])).toBe(true);
    expect(ok('merge-base', ['origin/main', 'HEAD'])).toBe(true);
    expect(ok('rev-parse', ['--abbrev-ref', 'HEAD'])).toBe(true);
    expect(ok('rev-list', ['--count', 'origin/main..HEAD'])).toBe(true);
    expect(ok('for-each-ref', ['--format=%(refname)'])).toBe(true);
    expect(ok('ls-files', [])).toBe(true);
    expect(ok('grep', ['-n', 'TODO'])).toBe(true);
  });

  it('rejects unknown / write subcommands', () => {
    for (const sub of ['commit', 'add', 'push', 'pull', 'merge', 'rebase', 'reset', 'checkout', 'clean', 'rm', 'mv', 'restore', 'switch', 'cherry-pick', 'revert', 'apply', 'gc', 'init', 'clone']) {
      expect(ok(sub, [])).toBe(false);
    }
  });

  it('rejects file-write and exec flags on read subcommands', () => {
    expect(ok('diff', ['--output=/tmp/x'])).toBe(false);
    expect(ok('diff', ['-o/tmp/x'])).toBe(false);
    expect(ok('diff', ['--ext-diff'])).toBe(false);
    expect(ok('grep', ['-Ovim', 'TODO'])).toBe(false);
    expect(ok('grep', ['--open-files-in-pager=vim', 'TODO'])).toBe(false);
    // the safe default must NOT be blocked
    expect(ok('diff', ['--no-ext-diff'])).toBe(true);
  });

  describe('branch', () => {
    it('allows list forms', () => {
      expect(ok('branch', [])).toBe(true);
      expect(ok('branch', ['--list'])).toBe(true);
      expect(ok('branch', ['-a'])).toBe(true);
      expect(ok('branch', ['--show-current'])).toBe(true);
    });
    it('rejects write forms', () => {
      expect(ok('branch', ['-d', 'feature'])).toBe(false);
      expect(ok('branch', ['-D', 'feature'])).toBe(false);
      expect(ok('branch', ['feature/new'])).toBe(false);
      expect(ok('branch', ['-m', 'old', 'new'])).toBe(false);
    });
  });

  describe('tag', () => {
    it('allows list', () => {
      expect(ok('tag', [])).toBe(true);
      expect(ok('tag', ['--list'])).toBe(true);
    });
    it('rejects create/delete', () => {
      expect(ok('tag', ['v1.0'])).toBe(false);
      expect(ok('tag', ['-d', 'v1.0'])).toBe(false);
      expect(ok('tag', ['-a', 'v1.0', '-m', 'msg'])).toBe(false);
    });
  });

  describe('config', () => {
    it('allows reads with an explicit read flag', () => {
      expect(ok('config', ['--get', 'remote.origin.url'])).toBe(true);
      expect(ok('config', ['--list'])).toBe(true);
      expect(ok('config', ['-l'])).toBe(true);
    });
    it('rejects writes and bare key/value', () => {
      expect(ok('config', ['user.name', 'Claude'])).toBe(false);
      expect(ok('config', ['--unset', 'user.name'])).toBe(false);
      expect(ok('config', ['--add', 'remote.x.url', 'y'])).toBe(false);
    });
  });

  describe('remote', () => {
    it('allows read forms', () => {
      expect(ok('remote', [])).toBe(true);
      expect(ok('remote', ['-v'])).toBe(true);
      expect(ok('remote', ['show', 'origin'])).toBe(true);
      expect(ok('remote', ['get-url', 'origin'])).toBe(true);
    });
    it('rejects mutations', () => {
      expect(ok('remote', ['add', 'origin', 'git@x:y.git'])).toBe(false);
      expect(ok('remote', ['set-url', 'origin', 'git@x:y.git'])).toBe(false);
      expect(ok('remote', ['prune', 'origin'])).toBe(false);
    });
  });

  describe('stash / worktree / submodule', () => {
    it('allows the read forms only', () => {
      expect(ok('stash', ['list'])).toBe(true);
      expect(ok('stash', ['show'])).toBe(true);
      expect(ok('worktree', ['list'])).toBe(true);
      expect(ok('submodule', [])).toBe(true);
      expect(ok('submodule', ['status'])).toBe(true);
    });
    it('rejects mutations and bare stash (push)', () => {
      expect(ok('stash', [])).toBe(false);
      expect(ok('stash', ['push'])).toBe(false);
      expect(ok('stash', ['pop'])).toBe(false);
      expect(ok('worktree', ['add', '/tmp/wt'])).toBe(false);
      expect(ok('submodule', ['update', '--init'])).toBe(false);
    });
  });

  describe('fetch', () => {
    it('allows non-destructive forms', () => {
      expect(ok('fetch', [])).toBe(true);
      expect(ok('fetch', ['origin'])).toBe(true);
      expect(ok('fetch', ['--all'])).toBe(true);
      expect(ok('fetch', ['--prune'])).toBe(true);
      expect(ok('fetch', ['--dry-run'])).toBe(true);
    });
    it('rejects refspec forms that can update a local branch', () => {
      expect(ok('fetch', ['origin', 'main:main'])).toBe(false);
      expect(ok('fetch', ['origin', '+refs/heads/main:refs/heads/feature'])).toBe(false);
    });
  });

  describe('reflog / symbolic-ref', () => {
    it('allows reads', () => {
      expect(ok('reflog', [])).toBe(true);
      expect(ok('reflog', ['show', 'HEAD'])).toBe(true);
      expect(ok('symbolic-ref', ['HEAD'])).toBe(true);
      expect(ok('symbolic-ref', ['--short', 'HEAD'])).toBe(true);
    });
    it('rejects writes', () => {
      expect(ok('reflog', ['expire', '--all'])).toBe(false);
      expect(ok('reflog', ['delete', 'HEAD@{0}'])).toBe(false);
      expect(ok('symbolic-ref', ['HEAD', 'refs/heads/x'])).toBe(false);
      expect(ok('symbolic-ref', ['--delete', 'HEAD'])).toBe(false);
    });
  });

  it('returns a human-readable reason on rejection', () => {
    const result = classifyGitInvocation('commit', ['-m', 'x']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('commit');
  });

  it('every declared read subcommand passes in its simplest read form', () => {
    const simplestArgs: Record<string, string[]> = {
      stash: ['list'],
      worktree: ['list'],
      config: ['--list'],
    };
    for (const sub of READ_GIT_SUBCOMMANDS) {
      expect(ok(sub, simplestArgs[sub] ?? [])).toBe(true);
    }
  });
});
