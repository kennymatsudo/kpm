import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { BaseAgentSession } from './BaseAgentSession';
import type { AgentCompletionSummary, AgentSessionRole, AgentType } from '../../../shared/agent-types';

const execFileAsync = promisify(execFile);

/** Minimal concrete session used to exercise BaseAgentSession's shared behavior directly. */
class TestAgentSession extends BaseAgentSession {
  readonly agentType: AgentType = 'claude';

  /** Lets a test control exactly when/how the fake transport resolves or throws. */
  pendingTurn: { resolve: () => void; reject: (err: unknown) => void } | null = null;
  /** Records whatever `abortTransport` callback stop() invoked. */
  abortCalls = 0;

  protected finalOutput(): string | null {
    return null;
  }

  async start(): Promise<void> {
    this.assertStarting();
    this.beginTurn('Starting...');
    this.runPromise = this.runFakeTurn();
  }

  respond(): Promise<void> {
    return Promise.reject(new Error('not used in these tests'));
  }

  followUp(): Promise<void> {
    if (!this.isFollowUpAllowed()) {
      return Promise.reject(new Error(`Cannot follow up in state: ${this._state}`));
    }
    this.beginTurn('Continuing...');
    this.runPromise = this.runFakeTurn();
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    await this.stopSession(() => {
      this.abortCalls += 1;
    });
  }

  /** Re-declared `public` so the tests below can await it directly instead of reflecting into the protected base field. */
  runPromise: Promise<void> | null = null;

  /** Runs a turn that stays open until the test resolves/rejects `pendingTurn`, then auto-completes on a clean resolve. */
  private runFakeTurn(): Promise<void> {
    return this.runGuardedTurn(
      () =>
        new Promise<void>((resolve, reject) => {
          this.pendingTurn = { resolve, reject };
        }).then(() => this.complete(async () => ({ filesChanged: 0, additions: 0, deletions: 0 }))),
      (error) => ({ message: error instanceof Error ? error.message : String(error) }),
    );
  }

  async complete(computeSummary: () => Promise<AgentCompletionSummary>): Promise<void> {
    await this.maybeCompleteTurn(computeSummary);
  }

  diffSummary(cwd: string | undefined): Promise<AgentCompletionSummary> {
    return this.computeGitDiffSummary(cwd);
  }

  lateFailure(error: unknown): void {
    this.failTurn(error, (err) => ({ message: err instanceof Error ? err.message : String(err) }));
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

describe('BaseAgentSession.beginTurn / runGuardedTurn happy path', () => {
  it('fires onComplete exactly once when the guarded turn resolves cleanly', async () => {
    const session = makeSession();

    const completions: AgentCompletionSummary[] = [];
    session.on('onComplete', (summary) => completions.push(summary));

    await session.start();
    expect(session.state).toBe('working');

    session.pendingTurn!.resolve();
    await session.runPromise;

    expect(completions).toHaveLength(1);
    expect(session.state).toBe('complete');
  });

  it('does not complete a second time if the turn somehow resolves again', async () => {
    const session = makeSession();
    const completions: AgentCompletionSummary[] = [];
    session.on('onComplete', (summary) => completions.push(summary));

    await session.start();
    session.pendingTurn!.resolve();
    await session.runPromise;

    await session.complete(async () => ({ filesChanged: 5, additions: 5, deletions: 5 }));

    expect(completions).toHaveLength(1);
  });
});

describe('BaseAgentSession.stopSession', () => {
  it('ends stopped and suppresses the transport error when stopping mid-turn', async () => {
    const session = makeSession();

    const errors: string[] = [];
    session.on('onError', (message) => errors.push(message));

    await session.start();
    expect(session.state).toBe('working');

    const stopPromise = session.stop();
    // The fake transport's abort callback rejects the in-flight turn promise,
    // mirroring a real AbortController-triggered throw.
    session.pendingTurn!.reject(new Error('aborted'));
    await stopPromise;

    expect(session.abortCalls).toBe(1);
    expect(session.state).toBe('stopped');
    expect(errors).toHaveLength(0);
  });

  it('is a no-op when the session is already in a terminal state', async () => {
    const session = makeSession();
    await session.start();
    session.pendingTurn!.resolve();
    await session.runPromise;
    expect(session.state).toBe('complete');

    await session.stop();

    expect(session.abortCalls).toBe(0);
    // stopSession's terminal-state early return leaves a `complete` session as-is.
    expect(session.state).toBe('complete');
  });
});

describe('BaseAgentSession.failTurn', () => {
  it('emits onError once and sets failed when the turn throws without stopping', async () => {
    const session = makeSession();

    const errors: string[] = [];
    session.on('onError', (message) => errors.push(message));

    await session.start();
    session.pendingTurn!.reject(new Error('boom'));
    await session.runPromise;

    expect(errors).toEqual(['boom']);
    expect(session.state).toBe('failed');
  });

  it('stays silent when a late failure lands after the session was stopped', async () => {
    const session = makeSession();

    const errors: string[] = [];
    session.on('onError', (message) => errors.push(message));

    await session.start();
    const stopPromise = session.stop();
    session.pendingTurn!.reject(new Error('aborted'));
    await stopPromise;
    expect(session.state).toBe('stopped');

    session.lateFailure(new Error('slow transport unwound late'));

    expect(errors).toHaveLength(0);
    expect(session.state).toBe('stopped');
  });
});

describe('BaseAgentSession followUp after completion', () => {
  it('resets stopping/completing flags and runs a second turn to completion', async () => {
    const session = makeSession();
    const completions: AgentCompletionSummary[] = [];
    session.on('onComplete', (summary) => completions.push(summary));

    await session.start();
    session.pendingTurn!.resolve();
    await session.runPromise;
    expect(session.state).toBe('complete');

    await session.followUp();
    expect(session.state).toBe('working');

    session.pendingTurn!.resolve();
    await session.runPromise;

    expect(session.state).toBe('complete');
    expect(completions).toHaveLength(2);
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
