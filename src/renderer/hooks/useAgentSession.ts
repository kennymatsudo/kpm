/**
 * useAgentSession - Hook for subscribing to agent session state for a specific dev session.
 *
 * Provides fine-grained access to agent state, activities, questions, and completion stats
 * from the devSessionsStore maps.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useDevSessionsStore } from '../stores/devSessions';
import { getAgentActivities, getAgentState } from '../services/agentSessionService';
import type { AgentSessionState } from '../../shared/types';
import type { AgentActivity, AgentQuestion, AgentCompletionSummary } from '../../shared/agent-types';

export interface AgentSessionInfo {
  agentState: AgentSessionState | undefined;
  activities: AgentActivity[];
  latestActivity: AgentActivity | undefined;
  question: AgentQuestion | null | undefined;
  completionStats: AgentCompletionSummary | undefined;
  isActive: boolean;
  isTerminal: boolean;
}

/**
 * Subscribe to agent session data for a specific dev session ID.
 * Returns undefined values when no agent session exists.
 */
export function useAgentSession(devSessionId: string | null): AgentSessionInfo {
  const agentStateMap = useDevSessionsStore((s) => s.agentStateBySessionId);
  const activitiesMap = useDevSessionsStore((s) => s.activitiesBySessionId);
  const latestActivityMap = useDevSessionsStore((s) => s.latestActivityBySessionId);
  const questionMap = useDevSessionsStore((s) => s.questionBySessionId);
  const completionMap = useDevSessionsStore((s) => s.completionBySessionId);
  const hydrateAgentSnapshot = useDevSessionsStore((s) => s.hydrateAgentSnapshot);

  // Track which session IDs have been hydrated to avoid re-running the effect
  // when agentStateMap changes on every incoming event for other sessions.
  const hydratedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!devSessionId) return;
    if (hydratedRef.current.has(devSessionId)) return;

    // Only fetch from main process when there is no in-store state yet.
    const store = useDevSessionsStore.getState();
    const hasState = store.agentStateBySessionId.has(devSessionId);
    const activities = store.activitiesBySessionId.get(devSessionId);
    if (hasState && activities && activities.length > 0) {
      hydratedRef.current.add(devSessionId);
      return;
    }

    hydratedRef.current.add(devSessionId);
    let cancelled = false;

    void Promise.all([
      getAgentState(devSessionId),
      getAgentActivities(devSessionId),
    ]).then(([stateResult, activitiesResult]) => {
      if (cancelled) return;
      if (!stateResult.success && !activitiesResult.success) return;

      hydrateAgentSnapshot(devSessionId, {
        state: stateResult.success ? (stateResult.state ?? null) : null,
        activities: activitiesResult.success ? (activitiesResult.activities ?? []) : undefined,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [devSessionId, hydrateAgentSnapshot]);

  return useMemo(() => {
    if (!devSessionId) {
      return {
        agentState: undefined,
        activities: [],
        latestActivity: undefined,
        question: undefined,
        completionStats: undefined,
        isActive: false,
        isTerminal: false,
      };
    }

    const agentState = agentStateMap.get(devSessionId);
    const isActive = agentState === 'starting' || agentState === 'working' || agentState === 'waiting_for_input';
    const isTerminal = agentState === 'complete' || agentState === 'failed' || agentState === 'stopped';

    return {
      agentState,
      activities: activitiesMap.get(devSessionId) ?? [],
      latestActivity: latestActivityMap.get(devSessionId),
      question: questionMap.get(devSessionId),
      completionStats: completionMap.get(devSessionId),
      isActive,
      isTerminal,
    };
  }, [devSessionId, agentStateMap, activitiesMap, latestActivityMap, questionMap, completionMap]);
}
