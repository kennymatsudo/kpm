import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { BaseAgentSession } from './BaseAgentSession';
import type { AgentCompletionSummary, AgentSessionRole } from '../../../shared/agent-types';

const execFileAsync = promisify(execFile);

/** Minimal concrete session used to exercise BaseAgentSession's shared behavior directly. */
class TestAgentSession extends BaseAgentSession {
  async start(): Promise<void> {
    this.assertStarting();
    this.setState('working');
  }

  respond(): Promise<void> {
    return Promise.reject(new Error('not used in these tests'));
  }

  followUp(): Promise<void> {
    if (!this.isFollowUpAllowed()) {
      return Promise.reject(new Error(`Cannot follow up in state: ${this._state}`));
    }
    this.setState('working');
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.setState('stopped');
    return Promise.resolve();
  }

  async complete(computeSummary: () => Promise<AgentCompletionSummary>): Promise<void> {
    // Mirrors how every real subclass wraps completeOnce: an outer
    // "is it even legal to complete right now" check, then the shared ritual.
    if (this._state === 'complete') return;
    await this.completeOnce(computeSummary);
  }

  diffSummary(cwd: string | undefined): Promise<AgentCompletionSummary> {
    return this.computeGitDiffSummary(cwd);
  }
}

function makeSession(role: AgentSessionRole = 'implement'): TestAgentSession {
  return new TestAgentSession('test-id', role);
}

describe('BaseAgentSession.assertStarting', () => {
  it('allows starting from the initial "starting" state', async () => {
    const session = makeSession();
    await expect(session.start()).resolves.toBeUndefined();
    expect(session.state).toBe('working');
  });

  it('throws when the session already left the starting state', async () => {
    const session = makeSession();
    await session.start();
    await expect(session.start()).rejects.toThrow('Cannot start session in state: working');
  });
});

describe('BaseAgentSession.isFollowUpAllowed', () => {
  it.each(['complete', 'failed', 'stopped'])('allows follow-up from terminal state %s', async (state) => {
    const session = makeSession();
    await session.start();
    (session as unknown as { setState: (s: string) => void }).setState(state);
    await expect(session.followUp()).resolves.toBeUndefined();
  });

  it.each(['starting', 'working', 'waiting_for_input'])('rejects follow-up from non-terminal state %s', async (state) => {
    const session = makeSession();
    (session as unknown as { setState: (s: string) => void }).setState(state);
    await expect(session.followUp()).rejects.toThrow(/Cannot follow up in state:/);
  });
});

describe('BaseAgentSession.completeOnce', () => {
  it('emits onComplete exactly once when called twice concurrently', async () => {
    const session = makeSession();
    await session.start();

    let resolveSummary!: (summary: AgentCompletionSummary) => void;
    const summaryPromise = new Promise<AgentCompletionSummary>((resolve) => {
      resolveSummary = resolve;
    });
    const computeSummary = () => summaryPromise;

    const completions: AgentCompletionSummary[] = [];
    session.on('onComplete', (summary) => completions.push(summary));

    // Simulate two independent triggers racing before either has resolved —
    // this is exactly the PTY-exit vs. hook-stop-event race CliAgentSession
    // was previously exposed to with no guard at all.
    const first = session.complete(computeSummary);
    const second = session.complete(computeSummary);

    resolveSummary({ filesChanged: 1, additions: 1, deletions: 0 });
    await Promise.all([first, second]);

    expect(completions).toHaveLength(1);
    expect(session.state).toBe('complete');
  });

  it('is a no-op once the session has already completed', async () => {
    const session = makeSession();
    await session.start();

    const completions: AgentCompletionSummary[] = [];
    session.on('onComplete', (summary) => completions.push(summary));

    await session.complete(async () => ({ filesChanged: 0, additions: 0, deletions: 0 }));
    await session.complete(async () => ({ filesChanged: 99, additions: 99, deletions: 99 }));

    expect(completions).toHaveLength(1);
  });
});

describe('BaseAgentSession.computeGitDiffSummary', () => {
  it('returns zeros when cwd is undefined', async () => {
    const session = makeSession();
    await expect(session.diffSummary(undefined)).resolves.toEqual({
      filesChanged: 0,
      additions: 0,
      deletions: 0,
    });
  });

  it('parses real git diff --stat output from a worktree', async () => {
    const repoDir = await mkdtemp(path.join(tmpdir(), 'base-agent-session-diff-'));
    try {
      await execFileAsync('git', ['init'], { cwd: repoDir });
      await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
      await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: repoDir });
      await writeFile(path.join(repoDir, 'file.txt'), 'line one\nline two\nline three\n');
      await execFileAsync('git', ['add', '.'], { cwd: repoDir });
      await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

      await writeFile(path.join(repoDir, 'file.txt'), 'line one\nline two changed\nline three\nline four\n');

      const session = makeSession();
      const summary = await session.diffSummary(repoDir);

      expect(summary.filesChanged).toBe(1);
      expect(summary.additions).toBeGreaterThan(0);
      expect(summary.deletions).toBeGreaterThan(0);
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('returns zeros when cwd is not a git repository', async () => {
    const nonRepoDir = await mkdtemp(path.join(tmpdir(), 'base-agent-session-nonrepo-'));
    try {
      const session = makeSession();
      await expect(session.diffSummary(nonRepoDir)).resolves.toEqual({
        filesChanged: 0,
        additions: 0,
        deletions: 0,
      });
    } finally {
      await rm(nonRepoDir, { recursive: true, force: true });
    }
  });
});
