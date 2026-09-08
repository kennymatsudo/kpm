/**
 * `useShallow` is load-bearing: `resolveReviewRuntime` mints a fresh object on
 * every call, so a selector that never compares equal makes React see a changed
 * snapshot on every render and throw "Maximum update depth exceeded". Every
 * field of `ReviewRuntime` is a primitive, so a shallow comparison keeps the
 * identity stable until something actually changes.
 */

import { useShallow } from 'zustand/react/shallow';
import { useDevSessionsStore } from '../../stores/devSessions';
import { resolveReviewRuntime, type ReviewRuntime } from './reviewSession';

export function useReviewRuntime(
  implementationSessionId: string,
  currentStepId: string | null,
): ReviewRuntime {
  return useDevSessionsStore(
    useShallow((s) => resolveReviewRuntime(
      implementationSessionId,
      currentStepId,
      s.agentStateBySessionId,
      s.reviewRunsByImplementationId.get(implementationSessionId) ?? [],
    ))
  );
}
