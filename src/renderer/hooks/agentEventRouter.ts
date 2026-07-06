import { toImplSessionId } from '../../shared/agent-types';
import type {
  AgentSessionStatePayload,
  AgentSessionActivityPayload,
  AgentSessionQuestionPayload,
  AgentSessionCompletePayload,
} from '../../shared/agent-types';
import type { AgentSessionErrorEventData } from '../../shared/ipc/agentSessionEvents';
import type { ReviewActionableSummary } from '../../shared/types';
import type { DevSessionsState } from '../stores/devSessions';

/** Agent-session IPC event handlers in the shape each `subscribeToAgent*`/`subscribeToReviewActionable` service function accepts. */
export interface AgentEventHandlers {
  onStateChanged: (event: AgentSessionStatePayload) => void;
  onActivity: (event: AgentSessionActivityPayload) => void;
  onQuestion: (event: AgentSessionQuestionPayload) => void;
  onComplete: (event: AgentSessionCompletePayload) => void;
  onError: (event: AgentSessionErrorEventData) => void;
  onReviewActionable: (summary: ReviewActionableSummary) => void;
}

/** The slice of the devSessions store the router drives. */
export type AgentEventStoreView = Pick<
  DevSessionsState,
  | 'handleAgentStateChanged'
  | 'handleAgentActivity'
  | 'handleAgentQuestion'
  | 'handleAgentComplete'
  | 'handleAgentError'
  | 'setReviewActionable'
>;

export interface AgentEventRouterDeps {
  getStore: () => AgentEventStoreView;
  /**
   * Implementation-session ids (the `dev_sessions` row ids) known for the
   * currently loaded project. `null` means that project's session set hasn't
   * loaded yet — events must pass through unfiltered rather than be dropped.
   */
  getKnownSessionIds: () => Set<string> | null;
}

export interface AgentEventRouter {
  /** Handlers to register with each `subscribeToAgent*`/`subscribeToReviewActionable` call. */
  handlers: AgentEventHandlers;
  /** Stop routing events. */
  dispose: () => void;
}

/**
 * Routes agent-session IPC events into the devSessions store.
 *
 * A dev session owns up to two runtimes — implementation and opposing
 * review — and the review runtime's tracked id is the suffixed
 * `toReviewSessionId(implId)` form. Events are matched against the known
 * implementation session ids after normalizing away that suffix, so
 * review-runtime events for a known session are never wrongly dropped.
 *
 * Pure wiring target: no React, no IPC subscription calls — `useDevSessionsSync`
 * adapts it to the component lifecycle.
 */
export function createAgentEventRouter(deps: AgentEventRouterDeps): AgentEventRouter {
  const { getStore, getKnownSessionIds } = deps;
  let active = true;

  const isKnownTrackedId = (trackedSessionId: string): boolean => {
    const knownSessionIds = getKnownSessionIds();
    if (knownSessionIds === null) return true;
    return knownSessionIds.has(toImplSessionId(trackedSessionId));
  };

  const handlers: AgentEventHandlers = {
    onStateChanged: (event) => {
      if (!active || !isKnownTrackedId(event.devSessionId)) return;
      getStore().handleAgentStateChanged(event.devSessionId, event.state);
    },
    onActivity: (event) => {
      if (!active || !isKnownTrackedId(event.devSessionId)) return;
      getStore().handleAgentActivity(event.devSessionId, event.activity);
    },
    onQuestion: (event) => {
      if (!active || !isKnownTrackedId(event.devSessionId)) return;
      getStore().handleAgentQuestion(event.devSessionId, event.question);
    },
    onComplete: (event) => {
      if (!active || !isKnownTrackedId(event.devSessionId)) return;
      getStore().handleAgentComplete(event.devSessionId, event.summary, event.findings);
    },
    onError: (event) => {
      if (!active || !isKnownTrackedId(event.devSessionId)) return;
      getStore().handleAgentError(event.devSessionId, event.error);
    },
    onReviewActionable: (summary) => {
      if (!active || !isKnownTrackedId(summary.sessionId)) return;
      getStore().setReviewActionable(summary);
    },
  };

  return {
    handlers,
    dispose: () => {
      active = false;
    },
  };
}
