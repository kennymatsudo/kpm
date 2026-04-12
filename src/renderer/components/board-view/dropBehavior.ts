import type { StatusCategory } from '../../../shared/types';

export interface BoardDropDecision {
  action: 'noop' | 'start_agent' | 'move';
  stopActiveSession: boolean;
}

/**
 * Centralize board drop behavior so drag-to-start stays testable.
 */
export function getBoardDropDecision(
  previousStatus: StatusCategory,
  newStatus: StatusCategory,
  hasActiveSession: boolean,
): BoardDropDecision {
  if (previousStatus === newStatus) {
    return { action: 'noop', stopActiveSession: false };
  }

  const FORWARD_TO_IN_PROGRESS: StatusCategory[] = ['not_started', 'blocked'];
  if (newStatus === 'in_progress' && !hasActiveSession && FORWARD_TO_IN_PROGRESS.includes(previousStatus)) {
    return { action: 'start_agent', stopActiveSession: false };
  }

  return {
    action: 'move',
    stopActiveSession: hasActiveSession && (newStatus === 'done' || newStatus === 'canceled' || newStatus === 'blocked'),
  };
}
