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
  | 'recordReviewRun'
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

/** Common shape of the relationship fields every widened agent-session payload carries. */
interface RelationshipEvent {
  devSessionId: string;
  implementationSessionId?: string;
  role?: AgentSessionStatePayload['role'];
  stepId?: string;
  runIndex?: number;
}

/**
 * Routes agent-session IPC events into the devSessions store.
 *
 * A dev session owns an implementation runtime plus zero or more review-role
 * runtimes (opposing review, playbook subagents). Main tags every event for a
 * review-role runtime with the implementation session id it belongs to
 * (`implementationSessionId`); events are matched against the known
 * implementation session ids using that field, falling back to stripping the
 * legacy `-review` suffix only for payloads that predate it.
 *
 * Pure wiring target: no React, no IPC subscription calls — `useDevSessionsSync`
 * adapts it to the component lifecycle.
 */
export function createAgentEventRouter(deps: AgentEventRouterDeps): AgentEventRouter {
  const { getStore, getKnownSessionIds } = deps;
  let active = true;

  const isKnownTrackedId = (trackedSessionId: string, implementationSessionId?: string): boolean => {
    const knownSessionIds = getKnownSessionIds();
    if (knownSessionIds === null) return true;
    return knownSessionIds.has(implementationSessionId ?? toImplSessionId(trackedSessionId));
  };

  const noteReviewRun = (event: RelationshipEvent): void => {
    if (event.role !== 'review' || !event.implementationSessionId) return;
    getStore().recordReviewRun(event.implementationSessionId, {
      sessionId: event.devSessionId,
      stepId: event.stepId,
      runIndex: event.runIndex,
    });
  };

  const handlers: AgentEventHandlers = {
    onStateChanged: (event) => {
      if (!active || !isKnownTrackedId(event.devSessionId, event.implementationSessionId)) return;
      noteReviewRun(event);
      getStore().handleAgentStateChanged(event.devSessionId, event.state);
    },
    onActivity: (event) => {
      if (!active || !isKnownTrackedId(event.devSessionId, event.implementationSessionId)) return;
      noteReviewRun(event);
      getStore().handleAgentActivity(event.devSessionId, event.activity);
    },
    onQuestion: (event) => {
      if (!active || !isKnownTrackedId(event.devSessionId)) return;
      getStore().handleAgentQuestion(event.devSessionId, event.question);
    },
    onComplete: (event) => {
      if (!active || !isKnownTrackedId(event.devSessionId, event.implementationSessionId)) return;
      noteReviewRun(event);
      getStore().handleAgentComplete(event.devSessionId, event.summary, event.findings);
    },
    onError: (event) => {
      if (!active || !isKnownTrackedId(event.devSessionId, event.implementationSessionId)) return;
      noteReviewRun(event);
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
