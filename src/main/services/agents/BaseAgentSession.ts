/**
 * BaseAgentSession - Shared base for SDK and CLI board agent sessions.
 *
 * Owns the event handler map, state field, activity list, and the helpers that
 * manipulate them. Concrete subclasses implement `start`, `respond`, `followUp`,
 * and `stop`; they also declare their own `agentType`.
 */

import type {
  AgentActivity,
  AgentSessionEvents,
  AgentSessionRole,
  AgentSessionState,
} from '../../../shared/agent-types';

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

  protected _state: AgentSessionState = 'starting';
  protected _activities: AgentActivity[] = [];

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
}
