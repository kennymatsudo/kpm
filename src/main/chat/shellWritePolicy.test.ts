import { describe, expect, it } from 'vitest';
import { shellCommandNeedsWriteGrant } from './shellWritePolicy';

describe('shellCommandNeedsWriteGrant', () => {
  it.each([
    'git status',
    'git log --oneline',
    'git -C /repos/my-app status --short',
    '/usr/bin/git diff',
    'git diff | head -50',
    'git status && git log --oneline -5',
  ])('lets provably read-only git run without the grant: %s', (command) => {
    expect(shellCommandNeedsWriteGrant(command)).toBe(false);
  });

  it.each([
    'git commit -m "fix"',
    'git push origin main',
    'echo hello; git commit -m "fix"',
    'git log > out.txt',
    'git -c core.pager=sh log',
    'git status | tee out.txt',
  ])('requires the grant for git that is not provably read-only: %s', (command) => {
    expect(shellCommandNeedsWriteGrant(command)).toBe(true);
  });

  it.each([
    'ls -la',
    'npm install',
    'echo "git is great"',
    'rg gitignore',
    'cat .gitignore',
  ])('requires the grant for any non-git command: %s', (command) => {
    expect(shellCommandNeedsWriteGrant(command)).toBe(true);
  });
});
