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


// =============================================================================
// Service Factory
// =============================================================================

export function createReviewPollService(deps: ReviewPollServiceDeps) {

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
    }
  }

  // ---------------------------------------------------------------------------
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


  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function start(): void {
    const config = getConfig().reviewPoll;
    if (!config.enabled) {
      return;
    }
  }

  function stop(): void {
  }

  function isRunning(): boolean {
  }

  async function pollNow(): Promise<PollTickSummary> {
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
