/**
 * PollScheduler
 *
 * Centralized scheduler for recurring background polling tasks. Each task
 * registers a handler plus an interval, and the scheduler owns:
 *
 *   - The timer + jitter
 *   - Concurrency guard (a single task never overlaps itself)
 *   - Per-task error backoff (exponential, capped)
 *   - Structured logging hook (one place to plug in metrics/tracing later)
 *   - Clean shutdown via AbortSignal + stopAll()
 *
 * Handlers are source-agnostic: they receive a `PollContext` with a logger
 * and an abort signal, and return a `PollTickResult`. New polling sources
 * (Linear, Jira, …) plug in by registering a handler — no per-source
 * lifecycle plumbing required.
 *
 * The scheduler does NOT own:
 *   - HTTP transport, ETag caching, rate-limit decoding — those belong to
 *     per-source clients. The scheduler only cares about *when* and *whether*
 *     a tick should run.
 *   - Notification fan-out — handlers emit events on the event bus; consumers
 *     decide what reaches the user.
 */

import { getConfig } from '../../config';

// =============================================================================
// Types
// =============================================================================

export type PollOutcome = 'ok' | 'noop' | 'error';

export interface PollTickResult {
  /** What happened on this tick — drives backoff and logging. */
  outcome: PollOutcome;
  /** Optional human-readable message for logs. */
  message?: string;
  /** Optional structured details for metrics/observability. */
  details?: Record<string, unknown>;
}

export interface PollLogger {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export interface PollContext {
  /** Stable task id from registration. */
  readonly taskId: string;
  /** Tick counter (1-based). */
  readonly tickNumber: number;
  /** AbortSignal that fires when the task is stopped or app shuts down. */
  readonly signal: AbortSignal;
  /** Structured logger scoped to this task. */
  readonly logger: PollLogger;
}

export type PollHandler = (ctx: PollContext) => Promise<PollTickResult>;

export interface PollTaskRegistration {
  /** Unique identifier — used in logs and to stop a specific task. */
  id: string;
  /** Base interval between successful ticks (ms). */
  intervalMs: number;
  /** The work to do each tick. */
  handler: PollHandler;
  /**
   * Jitter percentage applied to each scheduled delay (0–1). Defaults to the
   * scheduler-wide default in config. Set to 0 to disable.
   */
  jitterPct?: number;
  /**
   * Multiplier applied to the interval after a consecutive error. Capped by
   * `maxBackoffMs` from config. Defaults to the scheduler-wide default.
   */
  backoffMultiplier?: number;
  /**
   * Run an initial tick immediately on start, instead of waiting one interval.
   * Default: false.
   */
  runImmediately?: boolean;
  /**
   * Optional per-task logger override. Defaults to a console-backed logger
   * prefixed with `[Poll:<id>]`.
   */
  logger?: PollLogger;
}

export interface PollTaskStatus {
  id: string;
  running: boolean;
  consecutiveErrors: number;
  lastTickAt: string | null;
  lastOutcome: PollOutcome | null;
  nextTickEta: string | null;
}

// =============================================================================
// Default Logger
// =============================================================================

function createDefaultLogger(taskId: string): PollLogger {
  const prefix = `[Poll:${taskId}]`;
  return {
    info: (msg) => console.log(`${prefix} ${msg}`),
    warn: (msg) => console.warn(`${prefix} ${msg}`),
    error: (msg) => console.error(`${prefix} ${msg}`),
  };
}

// =============================================================================
// Internal Task State
// =============================================================================

interface TaskState {
  registration: Required<Pick<PollTaskRegistration,
    'id' | 'intervalMs' | 'handler' | 'jitterPct' | 'backoffMultiplier' | 'runImmediately'
  >> & { logger: PollLogger };
  timer: NodeJS.Timeout | null;
  abortController: AbortController;
  inFlight: boolean;
  consecutiveErrors: number;
  tickNumber: number;
  lastTickAt: Date | null;
  lastOutcome: PollOutcome | null;
  nextTickEta: Date | null;
  stopped: boolean;
}

function applyJitter(baseMs: number, jitterPct: number): number {
  if (jitterPct <= 0) return baseMs;
  const span = baseMs * jitterPct;
  // Symmetric jitter around the base interval: [base - span, base + span].
  const offset = (Math.random() * 2 - 1) * span;
  return Math.max(0, Math.round(baseMs + offset));
}

function computeBackoffDelay(state: TaskState): number {
  const { intervalMs, backoffMultiplier, jitterPct } = state.registration;
  const cap = getConfig().pollScheduler.maxBackoffMs;
  if (state.consecutiveErrors === 0) {
    return applyJitter(intervalMs, jitterPct);
  }
  const exp = Math.pow(backoffMultiplier, state.consecutiveErrors);
  const raw = Math.min(intervalMs * exp, cap);
  return applyJitter(raw, jitterPct);
}

// =============================================================================
// Factory
// =============================================================================

export function createPollScheduler() {
  const tasks = new Map<string, TaskState>();

  function scheduleNext(state: TaskState): void {
    if (state.stopped) return;
    const delay = computeBackoffDelay(state);
    state.nextTickEta = new Date(Date.now() + delay);
    state.timer = setTimeout(() => {
      void runTick(state);
    }, delay);
  }

  async function runTick(state: TaskState): Promise<void> {
    if (state.stopped) return;
    if (state.inFlight) {
      // Should never happen given setTimeout-based scheduling, but guard anyway.
      state.registration.logger.warn('Tick fired while previous tick still running, skipping');
      scheduleNext(state);
      return;
    }

    state.inFlight = true;
    state.tickNumber += 1;
    const ctx: PollContext = {
      taskId: state.registration.id,
      tickNumber: state.tickNumber,
      signal: state.abortController.signal,
      logger: state.registration.logger,
    };

    const startedAt = Date.now();
    try {
      const result = await state.registration.handler(ctx);
      const durationMs = Date.now() - startedAt;
      state.lastTickAt = new Date();
      state.lastOutcome = result.outcome;

      if (result.outcome === 'error') {
        state.consecutiveErrors += 1;
        state.registration.logger.error(
          `Tick ${state.tickNumber} failed (${state.consecutiveErrors} in a row): ${result.message ?? 'no message'}`,
          { durationMs, ...result.details },
        );
      } else {
        if (state.consecutiveErrors > 0) {
          state.registration.logger.info(
            `Recovered after ${state.consecutiveErrors} error(s)`,
          );
        }
        state.consecutiveErrors = 0;
        if (result.outcome === 'ok' && result.message) {
          state.registration.logger.info(result.message, { durationMs, ...result.details });
        }
      }
    } catch (error) {
      state.consecutiveErrors += 1;
      state.lastTickAt = new Date();
      state.lastOutcome = 'error';
      const msg = error instanceof Error ? error.message : String(error);
      state.registration.logger.error(
        `Tick ${state.tickNumber} threw (${state.consecutiveErrors} in a row): ${msg}`,
      );
    } finally {
      state.inFlight = false;
      scheduleNext(state);
    }
  }

  function register(registration: PollTaskRegistration): void {
    if (tasks.has(registration.id)) {
      throw new Error(`PollScheduler: task '${registration.id}' is already registered`);
    }

    const defaults = getConfig().pollScheduler;
    const state: TaskState = {
      registration: {
        id: registration.id,
        intervalMs: registration.intervalMs,
        handler: registration.handler,
        jitterPct: registration.jitterPct ?? defaults.defaultJitterPct,
        backoffMultiplier: registration.backoffMultiplier ?? defaults.defaultBackoffMultiplier,
        runImmediately: registration.runImmediately ?? false,
        logger: registration.logger ?? createDefaultLogger(registration.id),
      },
      timer: null,
      abortController: new AbortController(),
      inFlight: false,
      consecutiveErrors: 0,
      tickNumber: 0,
      lastTickAt: null,
      lastOutcome: null,
      nextTickEta: null,
      stopped: true, // Not started until start() is called.
    };

    tasks.set(registration.id, state);
  }

  function start(taskId: string): void {
    const state = tasks.get(taskId);
    if (!state) {
      throw new Error(`PollScheduler: task '${taskId}' is not registered`);
    }
    if (!state.stopped) return;

    state.stopped = false;
    state.abortController = new AbortController();
    state.registration.logger.info(
      `Started (interval=${state.registration.intervalMs}ms, jitter=${(state.registration.jitterPct * 100).toFixed(0)}%)`,
    );

    if (state.registration.runImmediately) {
      void runTick(state);
    } else {
      scheduleNext(state);
    }
  }

  function stop(taskId: string): void {
    const state = tasks.get(taskId);
    if (!state) return;
    if (state.stopped) return;

    state.stopped = true;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    state.abortController.abort();
    state.nextTickEta = null;
    state.registration.logger.info('Stopped');
  }

  function startAll(): void {
    for (const id of tasks.keys()) start(id);
  }

  function stopAll(): void {
    for (const id of tasks.keys()) stop(id);
  }

  function unregister(taskId: string): void {
    stop(taskId);
    tasks.delete(taskId);
  }

  async function runNow(taskId: string): Promise<PollTickResult> {
    const state = tasks.get(taskId);
    if (!state) {
      throw new Error(`PollScheduler: task '${taskId}' is not registered`);
    }
    if (state.inFlight) {
      // Wait for the current tick to settle, then run another.
      await new Promise<void>((resolve) => {
        const check = () => {
          if (!state.inFlight) resolve();
          else setTimeout(check, 50);
        };
        check();
      });
    }

    state.inFlight = true;
    state.tickNumber += 1;
    const ctx: PollContext = {
      taskId: state.registration.id,
      tickNumber: state.tickNumber,
      signal: state.abortController.signal,
      logger: state.registration.logger,
    };
    try {
      const result = await state.registration.handler(ctx);
      state.lastTickAt = new Date();
      state.lastOutcome = result.outcome;
      if (result.outcome === 'error') {
        state.consecutiveErrors += 1;
      } else {
        state.consecutiveErrors = 0;
      }
      return result;
    } catch (error) {
      state.consecutiveErrors += 1;
      state.lastTickAt = new Date();
      state.lastOutcome = 'error';
      const msg = error instanceof Error ? error.message : String(error);
      return { outcome: 'error', message: msg };
    } finally {
      state.inFlight = false;
    }
  }

  function getStatus(taskId: string): PollTaskStatus | null {
    const state = tasks.get(taskId);
    if (!state) return null;
    return {
      id: state.registration.id,
      running: !state.stopped,
      consecutiveErrors: state.consecutiveErrors,
      lastTickAt: state.lastTickAt?.toISOString() ?? null,
      lastOutcome: state.lastOutcome,
      nextTickEta: state.nextTickEta?.toISOString() ?? null,
    };
  }

  function listTasks(): PollTaskStatus[] {
    return Array.from(tasks.keys())
      .map((id) => getStatus(id))
      .filter((s): s is PollTaskStatus => s !== null);
  }

  return {
    register,
    unregister,
    start,
    stop,
    startAll,
    stopAll,
    runNow,
    getStatus,
    listTasks,
  };
}

export type PollScheduler = ReturnType<typeof createPollScheduler>;
