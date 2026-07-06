/**
 * BaseAgentSession - Shared base for SDK and CLI board agent sessions.
 *
 * Owns the event handler map, state field, activity list, and the helpers that
 * manipulate them, plus the turn lifecycle mechanics shared by all three
 * backends: starting a turn, running it under an `AbortController` with a
 * shared failure path, stopping it, failing it, and completing it exactly
 * once. Concrete subclasses implement `start`, `respond`, `followUp`, and
 * `stop` — each backend still decides *when* it's legal to start, complete, or
 * abandon a turn (that varies per transport), but the base class owns the
 * mechanics once a subclass has made that call.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { deriveReviewOutcome } from './reviewOutputContract';
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

/** Matches the summary line of `git diff --stat HEAD`, e.g. " 4 files changed, 142 insertions(+), 38 deletions(-)" */
const GIT_DIFF_STAT_PATTERN =
  /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/;

/**
 * Cap on the in-memory activity buffer per session. Long-running sessions (8h+)
 * can otherwise accumulate tens of thousands of activities, many of which carry
 * large tool-result payloads — unbounded growth shows up as both memory bloat
 * and IPC-serialization cost in the renderer.
 */
const MAX_ACTIVITIES_BUFFER = 500;

export abstract class BaseAgentSession {
  readonly id: string;
  readonly role: AgentSessionRole;
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

  constructor(id: string, role: AgentSessionRole) {
    this.id = id;
    this.role = role;
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
    if (this.role !== 'review') {
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
    this._activities.push(activity);
    if (this._activities.length > MAX_ACTIVITIES_BUFFER) {
      // Evict oldest entries in one batch. splice keeps a contiguous array and
      // is cheaper than repeated shift() calls.
      this._activities.splice(0, this._activities.length - MAX_ACTIVITIES_BUFFER);
    }
    this.emit('onActivity', activity);
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
    return this._state === 'complete' || this._state === 'failed' || this._state === 'stopped';
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
    alreadyStopped: () => boolean = () =>
      this._state === 'stopped' || this._state === 'complete' || this._state === 'failed',
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
    if (this._state === 'failed' || this._state === 'stopped' || this._state === 'complete') return;

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

  /** Parse `git diff --stat HEAD` in `cwd` into an `AgentCompletionSummary`. */
  protected async computeGitDiffSummary(cwd: string | undefined): Promise<AgentCompletionSummary> {
    if (!cwd) {
      return { filesChanged: 0, additions: 0, deletions: 0 };
    }

    try {
      const { stdout } = await execFileAsync('git', ['diff', '--stat', 'HEAD'], { cwd });
      const match = GIT_DIFF_STAT_PATTERN.exec(stdout);
      if (match) {
        return {
          filesChanged: parseInt(match[1], 10) || 0,
          additions: parseInt(match[2], 10) || 0,
          deletions: parseInt(match[3], 10) || 0,
        };
      }
    } catch {
      // Git diff may fail if not a git repo or no changes.
    }

    return { filesChanged: 0, additions: 0, deletions: 0 };
  }
}
