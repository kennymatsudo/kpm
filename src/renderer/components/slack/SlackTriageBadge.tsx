/**
 * Slack Triage Badge
 *
 * Shows pending triage count in the TopBar action buttons area.
 */

import { useEffect } from 'react';
import { useSlackTriageStore } from '../../stores';

interface SlackTriageBadgeProps {
  projectId: string;
}

export function SlackTriageBadge({ projectId }: SlackTriageBadgeProps) {
  const pendingCount = useSlackTriageStore((s) => s.pendingCount);
  const isPanelOpen = useSlackTriageStore((s) => s.isPanelOpen);
  const setPanelOpen = useSlackTriageStore((s) => s.setPanelOpen);
  const loadPendingCount = useSlackTriageStore((s) => s.loadPendingCount);

  useEffect(() => {

  return (
      <button
        onClick={() => setPanelOpen(!isPanelOpen)}
          isPanelOpen
            ? 'text-accent bg-accent/10'
            : 'text-text-muted hover:text-accent hover:bg-accent/10'
        }`}
        aria-label="Slack triage"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
          />
        </svg>
        {pendingCount > 0 && (
          <span className="absolute -top-0.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-tiny font-semibold bg-warning text-white rounded-full">
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
      </button>
  );
}
