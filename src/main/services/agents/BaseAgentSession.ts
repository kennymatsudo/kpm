/**
 * BaseAgentSession - Shared base for SDK and CLI board agent sessions.
 *
 * Owns the event handler map, state field, activity list, and the helpers that
 * manipulate them, plus the turn lifecycle mechanics shared by all board
 * backends: starting a turn, running it under an `AbortController` with a
 * shared failure path, stopping it, failing it, and completing it exactly
 * once. Concrete subclasses implement `start`, `respond`, `followUp`, and
 * `stop` — each backend still decides *when* it's legal to start, complete, or
 * abandon a turn (that varies per transport), but the base class owns the
 * mechanics once a subclass has made that call.
 */

import { execFile } from 'child_process';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { deriveReviewOutcome } from './reviewOutputContract';
import { isAgentTerminal } from '../../../shared/agent-types';
import type {
  AgentActivity,
  AgentCompletionSummary,
  AgentSessionEvents,
  AgentSessionRole,
  AgentSessionState,
  AgentType,
  AgentTurnResult,
} from '../../../shared/agent-types';

const execFileAsync = promisify(execFile);

/**
 * Thrown by `followUp()` when the session's current state doesn't allow a
 * follow-up turn to start. Callers branch on the type instead of
 * string-matching `message` (kept identical to the pre-existing text for
 * anything still logging it).
 */
export class FollowUpNotAllowedError extends Error {
  constructor(state: AgentSessionState) {
    super(`Cannot follow up in state: ${state}`);
    this.name = 'FollowUpNotAllowedError';
  }
}

/** Untracked files above this size count as changed without their lines being counted. */
const MAX_UNTRACKED_LINE_COUNT_BYTES = 2 * 1024 * 1024;

const MAX_LINE_COUNTED_NEW_FILES = 500;
const UNKNOWN_DIFF: AgentCompletionSummary = { filesChanged: 0, additions: 0, deletions: 0, diffUnknown: true };

/** Sum `git diff --numstat` output. Binary files print `-` for both counts. */
function sumNumstat(stdout: string): { files: number; additions: number; deletions: number } {
  let files = 0;
  let additions = 0;
  let deletions = 0;
  for (const line of stdout.split('\n')) {
    const match = /^(\d+|-)\t(\d+|-)\t/.exec(line);
    if (!match) continue;
    files += 1;
    additions += match[1] === '-' ? 0 : parseInt(match[1], 10);
    deletions += match[2] === '-' ? 0 : parseInt(match[2], 10);
  }
  return { files, additions, deletions };
}

/** Lines in a new file, counted the way git would: binary and oversized files add none. */
async function countAddedLines(filePath: string): Promise<number> {
  try {
    const { size } = await stat(filePath);
    if (size === 0 || size > MAX_UNTRACKED_LINE_COUNT_BYTES) return 0;
    const content = await readFile(filePath);
    if (content.includes(0)) return 0;
    let lines = 0;
    for (const byte of content) if (byte === 0x0a) lines += 1;
    return content[content.length - 1] === 0x0a ? lines : lines + 1;
  } catch {
    return 0;
  }
}

/**
 * Cap on the in-memory activity buffer per session. Long-running sessions (8h+)
 * can otherwise accumulate tens of thousands of activities, many of which carry
 * large tool-result payloads — unbounded growth shows up as both memory bloat
 * and IPC-serialization cost in the renderer.
 */
const MAX_ACTIVITIES_BUFFER = 500;

/**
 * Cap on a single activity's `content`. A `Read` of a large file or a `Bash`
 * running a test suite otherwise carries its whole output into the buffer above,
 * across IPC, and into the renderer's feed. The detail pane only ever renders
 * this as a preview.
 */
const MAX_ACTIVITY_CONTENT_CHARS = 4000;

function withBoundedContent(activity: AgentActivity): AgentActivity {
  const { content } = activity;
  if (typeof content !== 'string' || content.length <= MAX_ACTIVITY_CONTENT_CHARS) return activity;
  return {
    ...activity,
    content: `${content.slice(0, MAX_ACTIVITY_CONTENT_CHARS)}\n… (truncated, ${content.length} chars)`,
  };
}

export abstract class BaseAgentSession {
  readonly id: string;
  readonly role: AgentSessionRole;
  private readonly expectsFindings: boolean;
  /**
   * The commit completion stats are measured from. Each turn's work is
   * committed onto the task branch, so an implement session passes its fork
   * point to report the whole run; without one, stats cover uncommitted work.
   */
  protected readonly diffBase: string | null;
  abstract readonly agentType: AgentType;

  protected _state: AgentSessionState = 'starting';
  protected _activities: AgentActivity[] = [];

  /**
   * Guards `completeOnce` against concurrent double-entry (e.g. a PTY exit and
   * a hook "stop" event racing before either has moved `_state` off 'working').
   * `completeOnce` itself resets this once a completion fires; `beginTurn`
   * additionally resets it at the start of a new turn as a defensive measure
   * against a prior, still in-flight completion attempt.
   */
  protected completing = false;

  /**
   * Set for the duration of `stopSession`. `runGuardedTurn`'s failure path
   * checks this to tell a user-initiated abort (expected transport throw,
   * must not surface as `onError`/`failed`) apart from a genuine backend
   * failure.
   */
  protected stopping = false;

  /** The in-flight turn, so `stopSession` can await it unwinding before declaring the session stopped. */
  protected runPromise: Promise<void> | null = null;

  /**
   * The current turn's abort mechanism, owned by `runGuardedTurn` for its
   * duration. Null between turns and after a turn's `finally` has run.
   */
  protected abortController: AbortController | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected handlers = new Map<string, Set<(...args: any[]) => void>>();

  constructor(
    id: string,
    role: AgentSessionRole,
    expectsFindings = role === 'review',
    diffBase: string | null = null,
  ) {
    this.id = id;
    this.role = role;
    this.expectsFindings = expectsFindings;
    this.diffBase = diffBase;
  }

  // ===========================================================================
  // Public Interface
  // ===========================================================================

  get state(): AgentSessionState {
    return this._state;
  }

  get activities(): AgentActivity[] {
    return this._activities;
  }

  on<K extends keyof AgentSessionEvents>(event: K, handler: AgentSessionEvents[K]): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as (...args: unknown[]) => void);
  }

  off<K extends keyof AgentSessionEvents>(event: K, handler: AgentSessionEvents[K]): void {
    this.handlers.get(event)?.delete(handler as (...args: unknown[]) => void);
  }

  /**
   * Drop every registered handler. Called by AgentSessionManager when the session
   * is evicted (after the 30 min terminal-state TTL, or on explicit remove) so
   * captured closures — including the IPC broadcast callbacks bound to a
   * webContents — don't keep the session alive or fire on stale state.
   */
  clearHandlers(): void {
    this.handlers.clear();
  }

  /**
   * The agent's turn result — final output text, plus parsed review findings
   * when `role === 'review'`. Backends only need to supply `finalOutput()`;
   * the parse against the shared review-output contract is identical for all.
   */
  getResult(): AgentTurnResult {
    const finalText = this.finalOutput();
    if (!this.expectsFindings) {
      return { finalText };
    }

    const outcome = deriveReviewOutcome(finalText, this.agentType);
    return {
      finalText,
      review: 'findings' in outcome ? { findings: outcome.findings! } : { error: outcome.error! },
      reviewRawOutput: outcome.rawOutput,
    };
  }

  /** The agent's most recent non-empty output text, if any. */
  protected abstract finalOutput(): string | null;

  // ===========================================================================
  // Protected Helpers
  // ===========================================================================

  protected setState(state: AgentSessionState): void {
    if (this._state === state) return;
    this._state = state;
    this.emit('onStateChange', state);
  }

  protected emitActivity(activity: AgentActivity): void {
    const bounded = withBoundedContent(activity);
    this._activities.push(bounded);
    if (this._activities.length > MAX_ACTIVITIES_BUFFER) {
      // Evict oldest entries in one batch. splice keeps a contiguous array and
      // is cheaper than repeated shift() calls.
      this._activities.splice(0, this._activities.length - MAX_ACTIVITIES_BUFFER);
    }
    this.emit('onActivity', bounded);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected emit<K extends keyof AgentSessionEvents>(event: K, ...args: any[]): void {
    const handlerSet = this.handlers.get(event);
    if (!handlerSet) return;
    for (const handler of handlerSet) {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[${this.constructor.name}] Event handler error (${event}):`, err);
      }
    }
  }

  /** Throws unless the session is in its pre-turn `starting` state. */
  protected assertStarting(): void {
    if (this._state !== 'starting') {
      throw new Error(`Cannot start session in state: ${this._state}`);
    }
  }

  /** Whether the session has reached a state a follow-up turn can resume from. */
  protected isFollowUpAllowed(): boolean {
    return isAgentTerminal(this._state);
  }

  /**
   * Returns a `FollowUpNotAllowedError` unless the session has reached a state
   * a follow-up turn can resume from, so `followUp()` implementations (none of
   * which are `async`) can reject with it directly instead of throwing across
   * a try/catch.
   */
  protected checkFollowUpAllowed(): FollowUpNotAllowedError | null {
    return this.isFollowUpAllowed() ? null : new FollowUpNotAllowedError(this._state);
  }

  /** Emit the standard "beginning a turn" system activity. */
  protected emitStartingActivity(summary: string): void {
    this.emitActivity({ type: 'system', timestamp: Date.now(), summary, status: 'running' });
  }

  /**
   * Reset the per-turn guards and announce the turn's start. Covers both the
   * initial `start()` call and every `followUp()` — a follow-up resumes a
   * session that already ran `completeOnce` (which cleared `completing`) but
   * must also clear `stopping`, since a prior turn's `stopSession` may have
   * set it before this turn began.
   */
  protected beginTurn(startingSummary: string): void {
    this.stopping = false;
    this.completing = false;
    this.emitStartingActivity(startingSummary);
    this.setState('working');
  }

  /**
   * Run a transport turn under a fresh `AbortController`, routing any throw
   * through `failTurn` unless the throw was caused by `stopSession` aborting
   * it. Owns the controller's full lifecycle: created here, exposed via
   * `this.abortController` for `stopSession` to abort, cleared in `finally`
   * regardless of outcome.
   */
  protected async runGuardedTurn(
    run: (signal: AbortSignal) => Promise<void>,
    classify: (error: unknown) => { message: string },
  ): Promise<void> {
    this.abortController = new AbortController();
    try {
      await run(this.abortController.signal);
    } catch (error) {
      this.failTurn(error, classify);
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Stop the session: abort the in-flight turn's transport, wait for the turn
   * promise to unwind (its rejection — expected from the abort — is
   * swallowed), then transition to `stopped`. A no-op once `alreadyStopped`
   * says the session is already fully torn down.
   *
   * `alreadyStopped` defaults to every terminal state, but a backend whose
   * transport process stays alive across turns (e.g. the SDK keeps its worker
   * warm for follow-ups even after `complete`/`failed`) can narrow it to just
   * `stopped`, since a user-initiated stop must still release those
   * resources.
   */
  protected async stopSession(
    abortTransport: () => void | Promise<void>,
    alreadyStopped: () => boolean = () => isAgentTerminal(this._state),
  ): Promise<void> {
    if (alreadyStopped()) {
      return;
    }

    this.stopping = true;
    await abortTransport();

    try {
      await this.runPromise;
    } catch {
      // Expected — the aborted turn's promise rejects on its way out.
    }

    this.setState('stopped');
  }

  /**
   * Report a turn failure: emit an error activity, transition to `failed`,
   * and emit `onError` — exactly once. Suppressed while `stopSession` is
   * tearing the turn down (that's an expected abort, not a failure) and once
   * the session has already reached a terminal state (a slow-to-unwind
   * transport throwing after `stop`/a prior failure/completion already
   * settled things must not resurface as a new failure).
   */
  protected failTurn(error: unknown, classify: (error: unknown) => { message: string }): void {
    if (this.stopping) return;
    if (isAgentTerminal(this._state)) return;

    const classified = classify(error);
    this.emitActivity({
      type: 'error',
      timestamp: Date.now(),
      summary: classified.message,
      content: classified.message,
    });
    this.setState('failed');
    this.emit('onError', classified.message);
  }

  /**
   * Complete the current turn if — and only if — the session is still
   * `working`. Backends reach this from different signals (SDK iterator end,
   * PTY exit, hook "stop" event) that can race or fire after the session has
   * already moved on; this is the single gate all of them go through before
   * `completeOnce`'s own re-entrancy guard.
   */
  protected async maybeCompleteTurn(computeSummary: () => Promise<AgentCompletionSummary>): Promise<void> {
    if (this._state !== 'working') return;
    await this.completeOnce(computeSummary);
  }

  /**
   * Run `computeSummary`, transition to `complete`, and emit `onComplete` —
   * exactly once per turn. Callers still decide *whether* it's currently legal
   * to complete (that check varies by backend); this only guarantees the
   * completion ritual itself can't fire twice for the same turn.
   */
  protected async completeOnce(computeSummary: () => Promise<AgentCompletionSummary>): Promise<void> {
    if (this.completing) return;
    this.completing = true;
    const summary = await computeSummary();
    this.setState('complete');
    this.emit('onComplete', summary);
    this.completing = false;
  }

  /**
   * Files and lines changed in `cwd` since `diffBase` (or HEAD), new untracked
   * files included. Reads only: the index is never touched, so what the capture
   * commit stages is unaffected. A git failure reports the diff as unknown
   * rather than as no changes.
   */
  protected async computeGitDiffSummary(cwd: string | undefined): Promise<AgentCompletionSummary> {
    if (!cwd) return UNKNOWN_DIFF;

    try {
      const [tracked, untracked] = await Promise.all([
        execFileAsync('git', ['diff', '--numstat', this.diffBase ?? 'HEAD', '--'], { cwd, maxBuffer: 10 * 1024 * 1024 }),
        execFileAsync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd, maxBuffer: 10 * 1024 * 1024 }),
      ]);
      const totals = sumNumstat(tracked.stdout);
      const newFiles = untracked.stdout.split('\0').filter(Boolean);
      let newLines = 0;
      // One at a time, and only the first few hundred: a repo that doesn't
      // ignore something like node_modules can leave tens of thousands of new
      // files, and reading them all would hold up the turn's completion. Past
      // the cap they still count as changed files, just not their lines.
      for (const file of newFiles.slice(0, MAX_LINE_COUNTED_NEW_FILES)) {
        newLines += await countAddedLines(path.join(cwd, file));
      }
      return {
        filesChanged: totals.files + newFiles.length,
        additions: totals.additions + newLines,
        deletions: totals.deletions,
      };
    } catch {
      return UNKNOWN_DIFF;
    }
  }
}
