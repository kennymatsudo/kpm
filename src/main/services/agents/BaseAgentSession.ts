/**
 * BaseAgentSession - Shared base for SDK and CLI board agent sessions.
 *
 * Owns the event handler map, state field, activity list, and the helpers that
 * manipulate them, plus the turn/completion lifecycle mechanics shared by all
 * three backends (start-state assertion, follow-up eligibility, git-diff-stat
 * completion summaries, and the completion re-entrancy guard). Concrete
 * subclasses implement `start`, `respond`, `followUp`, and `stop` — each backend
 * still decides *when* it's legal to complete or start a turn, since that varies
 * per backend; the base class guarantees that once a subclass decides to
 * complete, it happens exactly once.
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
   * `completeOnce` itself resets this once a completion fires; some subclasses
   * additionally reset it at the start of a new turn as a defensive measure
   * against a prior, still in-flight completion attempt.
   */
  protected completing = false;

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

  /** Emit the standard "beginning a turn" system activity. */
  protected emitStartingActivity(summary: string): void {
    this.emitActivity({ type: 'system', timestamp: Date.now(), summary, status: 'running' });
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
