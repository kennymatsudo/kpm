/**
 * Review Poll Service
 *
 * Background poller that monitors GitHub PR comments for sessions in review,
 * auto-assesses whether feedback is worth addressing, and launches agents
 * to fix worthy issues.
 *
 * Per-session tick flow:
 * 1. Sync live PR threads via ReviewService
 * 2. Detect new `needs_review` tasks
 * 3. Assess threads via ReviewAssessmentService (Claude SDK triage)
 * 4. For `implement` dispositions: launch headless fix via DevSessionService
 * 5. Broadcast IPC events for UI transparency
 *
 * Lifecycle: registers with the central PollScheduler. The scheduler owns the
 * timer, jitter, error backoff, and clean shutdown. This service owns only
 * the per-session business logic and the public IPC-facing methods.
 */

import type {
  IDevSessionRepository,
  IPlanItemRepository,
  IProjectRepository,
  IReviewTaskRepository,
} from '../../db/interfaces';
import { getConfig } from '../../config';
import { buildAutomationPrompt } from './ReviewService';
import type { ReviewService } from './ReviewService';
import type { ReviewAssessmentService } from './ReviewAssessmentService';
import type { DevSessionService } from './DevSessionService';
import type { GitHubService } from './GitHubService';
import type { AgentSessionManager } from '../agents/AgentSessionManager';
import type { PollScheduler, PollTickResult } from '../core/PollScheduler';
import type { UpdateEventBus } from '../core/UpdateEventBus';

// =============================================================================
// Types
// =============================================================================

export interface ReviewPollServiceDeps {
  projects: IProjectRepository;
  devSessions: IDevSessionRepository;
  planItems: IPlanItemRepository;
  reviewTasks: IReviewTaskRepository;
  reviewService: ReviewService;
  reviewAssessmentService: ReviewAssessmentService;
  devSessionService: DevSessionService;
  gitHubService: GitHubService;
  agentSessionManager: AgentSessionManager;
  broadcastToWindows: (channel: string, payload: unknown) => void;
  scheduler: PollScheduler;
  eventBus: UpdateEventBus;
}

export interface PollTickSummary {
  processed: number;
  fixesStarted: number;
  assessmentsRun: number;
  needsAttention: number;
  errors: number;
  timestamp: string;
}

export interface PollSessionResult {
  sessionId: string;
  newThreadCount: number;
  implementCount: number;
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const TASK_ID = 'review-poll';

// =============================================================================
// Service Factory
// =============================================================================

export function createReviewPollService(deps: ReviewPollServiceDeps) {
  let registered = false;
  let started = false;

  // Per-session error backoff: sessionId → remaining ticks to skip.
  // Kept here (rather than in the scheduler) because backoff is per-session,
  // not per-task — a transient error on session A shouldn't slow session B.
  const errorBackoff = new Map<string, number>();

  // ---------------------------------------------------------------------------
  // Session Discovery
  // ---------------------------------------------------------------------------

  function discoverEligibleSessions(): DevSession[] {
    const config = getConfig().reviewPoll;
    const allProjects = deps.projects.list();
    const eligible: DevSession[] = [];

    for (const project of allProjects) {
      const sessions = deps.devSessions.getByProject(project.id);

      for (const session of sessions) {
        if (!session.pr_number) continue;
        if (session.status !== 'inactive') continue;
        if (!session.plan_item_id) continue;
        const planItem = deps.planItems.get(session.plan_item_id);

        const agentSession = deps.agentSessionManager.getByDevSession(session.id);
        if (agentSession && !isTerminalState(agentSession.state)) continue;

        const activeCount = deps.agentSessionManager.getActiveCountForProject(session.project_id);
        if (activeCount >= getConfig().agentSession.maxConcurrentSessionsPerProject) continue;

        eligible.push(session);
      }
    }

    return eligible.slice(0, config.maxSessionsPerTick);
  }

  function isTerminalState(state: string): boolean {
    return state === 'complete' || state === 'failed' || state === 'stopped';
  }

  function shouldSkipForBackoff(sessionId: string): boolean {
    const remaining = errorBackoff.get(sessionId);
    if (remaining == null || remaining <= 0) {
      errorBackoff.delete(sessionId);
      return false;
    }
    errorBackoff.set(sessionId, remaining - 1);
    return true;
  }

  function applyBackoff(sessionId: string): void {
    const config = getConfig().reviewPoll;
    errorBackoff.set(sessionId, config.errorBackoffTicks);
  }

  // ---------------------------------------------------------------------------
  // Actionable-Review Summary
  // ---------------------------------------------------------------------------

    if (session.pr_number == null) return null;
    const tasks = deps.reviewTasks.getByRepoPr(session.repo_id, session.pr_number);
    const counts = { needsInput: 0, failed: 0, stale: 0, errored: 0 };
    for (const t of tasks) {
      if (t.session_id !== session.id) continue;
      if (t.status === 'done') continue;
      if (t.internal_state === 'ignored') continue;
      if (t.disposition === 'needs_user_input') counts.needsInput++;
      else if (t.internal_state === 'failed') counts.failed++;
      else if (t.internal_state === 'stale') counts.stale++;
      else if (t.error != null) counts.errored++;
    }
    const hasActionable =
      counts.needsInput > 0 || counts.failed > 0 || counts.stale > 0 || counts.errored > 0;
    return { sessionId: session.id, hasActionable, counts };
  }

    if (!summary) return;
    deps.broadcastToWindows('review-poll:actionable', summary);
  }

  // ---------------------------------------------------------------------------
  // Per-Session Processing
  // ---------------------------------------------------------------------------

  async function processSession(session: DevSession): Promise<PollSessionResult> {
    const sessionId = session.id;

    if (shouldSkipForBackoff(sessionId)) {
      return { sessionId, action: 'skipped', newThreadCount: 0, implementCount: 0 };
    }

    try {
      if (!syncResult.ok) {
        applyBackoff(sessionId);
        return { sessionId, action: 'error', newThreadCount: 0, implementCount: 0, error: syncResult.error };
      }

      const tasks = deps.reviewTasks.getByRepoPr(session.repo_id, session.pr_number!);
      const needsReviewTasks = tasks.filter(t => t.session_id === sessionId && t.status === 'needs_review');

      if (needsReviewTasks.length === 0) {
        return { sessionId, action: 'synced', newThreadCount: 0, implementCount: 0 };
      }

      // New review threads detected — emit to the event bus so notification
      // and metrics consumers can react without coupling to this service.
      deps.eventBus.emit({
        kind: 'pr_changed',
        source: 'github',
        detectedAt: new Date().toISOString(),
        sessionId,
        prNumber: session.pr_number!,
        repoId: session.repo_id,
        change: 'new_review_threads',
        summary: `${needsReviewTasks.length} new review thread(s)`,
      });

      const assessResult = await deps.reviewAssessmentService.assessThreads(sessionId);
      if (!assessResult.ok) {
        applyBackoff(sessionId);
        return {
          sessionId,
          action: 'error',
          newThreadCount: needsReviewTasks.length,
          implementCount: 0,
          error: assessResult.error,
        };
      }

      const refreshedTasks = deps.reviewTasks.getByRepoPr(session.repo_id, session.pr_number!);
      const implementTasks = refreshedTasks.filter(
        t => t.session_id === sessionId && t.disposition === 'implement' && t.status === 'assessed'
      );
      const needsInputTasks = refreshedTasks.filter(
        t => t.session_id === sessionId && t.disposition === 'needs_user_input' && t.status === 'assessed'
      );

      if (needsInputTasks.length > 0) {
        deps.broadcastToWindows('review-poll:needs-attention', {
          sessionId,
          reason: `${needsInputTasks.length} thread(s) need your input`,
          taskIds: needsInputTasks.map(t => t.id),
        });
      }

      if (implementTasks.length === 0) {
        return {
          sessionId,
          action: needsInputTasks.length > 0 ? 'needs_attention' : 'assessed',
          newThreadCount: needsReviewTasks.length,
          implementCount: 0,
        };
      }

      const implementTaskIds = implementTasks.map(t => t.id);
      const threadIds = implementTasks.map(t => t.thread_id);

      const queueResult = deps.reviewService.queueReviewTasks(sessionId, implementTaskIds);
      if (!queueResult.ok) {
        return {
          sessionId,
          action: 'error',
          newThreadCount: needsReviewTasks.length,
          implementCount: 0,
          error: queueResult.error,
        };
      }

      const contextResult = await deps.gitHubService.buildAddressReviewContext(sessionId, { threadIds });
      if (!contextResult.ok) {
        applyBackoff(sessionId);
        return {
          sessionId,
          action: 'error',
          newThreadCount: needsReviewTasks.length,
          implementCount: implementTasks.length,
          error: contextResult.error,
        };
      }

      const prompt = buildAutomationPrompt(contextResult.data);
      const followUpResult = await deps.devSessionService.sendAgentFollowUp(sessionId, prompt);
      if (!followUpResult.ok) {
        deps.devSessionService.updateAutomationPhase(sessionId, 'needs_attention');
        return {
          sessionId,
          action: 'error',
          newThreadCount: needsReviewTasks.length,
          implementCount: implementTasks.length,
          error: followUpResult.error,
        };
      }

      deps.devSessionService.updateAutomationPhase(sessionId, 'addressing_review');

      deps.broadcastToWindows('review-poll:fix-started', {
        sessionId,
        taskIds: implementTaskIds,
        threadCount: implementTasks.length,
      });

      errorBackoff.delete(sessionId);

      return {
        sessionId,
        action: 'fix_started',
        newThreadCount: needsReviewTasks.length,
        implementCount: implementTasks.length,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      applyBackoff(sessionId);

      deps.broadcastToWindows('review-poll:error', { sessionId, error: msg });

      return { sessionId, action: 'error', newThreadCount: 0, implementCount: 0, error: msg };
    } finally {
    }
  }

  // ---------------------------------------------------------------------------
  // Tick (called by the scheduler, or directly via pollNow)
  // ---------------------------------------------------------------------------

  async function runTick(): Promise<PollTickSummary> {
    const sessions = discoverEligibleSessions();
    const summary: PollTickSummary = {
      processed: 0,
      fixesStarted: 0,
      assessmentsRun: 0,
      needsAttention: 0,
      errors: 0,
      timestamp: new Date().toISOString(),
    };

    if (sessions.length === 0) {
      return summary;
    }

    // Sequential to avoid GitHub rate limiting.
    for (const session of sessions) {
      const result = await processSession(session);
      summary.processed++;

      switch (result.action) {
        case 'fix_started':
          summary.fixesStarted++;
          summary.assessmentsRun++;
          break;
        case 'assessed':
          summary.assessmentsRun++;
          break;
        case 'needs_attention':
          summary.needsAttention++;
          summary.assessmentsRun++;
          break;
        case 'error':
          summary.errors++;
          break;
        case 'synced':
        case 'skipped':
          break;
      }
    }

    deps.broadcastToWindows('review-poll:tick-complete', summary);

    return summary;
  }

  // ---------------------------------------------------------------------------
  // Scheduler Registration
  // ---------------------------------------------------------------------------

  function ensureRegistered(): void {
    if (registered) return;
    const config = getConfig().reviewPoll;
    deps.scheduler.register({
      id: TASK_ID,
      intervalMs: config.pollIntervalMs,
      handler: async (ctx): Promise<PollTickResult> => {
        const summary = await runTick();
        if (summary.processed === 0) {
          return { outcome: 'noop' };
        }
        const message =
          `${summary.processed} processed, ${summary.fixesStarted} fix(es), ` +
        ctx.logger.info(message, {
          processed: summary.processed,
          fixesStarted: summary.fixesStarted,
          errors: summary.errors,
        });
        return {
          outcome: summary.errors > 0 && summary.fixesStarted === 0 ? 'error' : 'ok',
          message,
          details: { ...summary },
        };
      },
    });
    registered = true;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function start(): void {
    if (started) return;
    const config = getConfig().reviewPoll;
    if (!config.enabled) {
      console.log('[ReviewPoll] Disabled by config');
      return;
    }
    ensureRegistered();
    deps.scheduler.start(TASK_ID);
    started = true;
  }

  function stop(): void {
    if (!started) return;
    deps.scheduler.stop(TASK_ID);
    started = false;
  }

  function isRunning(): boolean {
    return started;
  }

  async function pollNow(): Promise<PollTickSummary> {
    return runTick();
  }

  async function pollSession(sessionId: string): Promise<PollSessionResult> {
    const session = deps.devSessions.get(sessionId);
    if (!session) {
      return { sessionId, action: 'error', newThreadCount: 0, implementCount: 0, error: 'Session not found' };
    }

    if (!session.pr_number) {
      return { sessionId, action: 'error', newThreadCount: 0, implementCount: 0, error: 'No PR associated' };
    }

    const agentSession = deps.agentSessionManager.getByDevSession(sessionId);
    if (agentSession && !isTerminalState(agentSession.state)) {
      return { sessionId, action: 'skipped', newThreadCount: 0, implementCount: 0 };
    }

    errorBackoff.delete(sessionId);

    return processSession(session);
  }

  return {
    start,
    stop,
    isRunning,
    pollNow,
    pollSession,
  };
}

export type ReviewPollService = ReturnType<typeof createReviewPollService>;
