/**
 * CardActivityLine - Renders a one-line activity status from the latest AgentActivity.
 * Shown on board cards when an agent session is active.
 */

import { memo } from 'react';
import type { AgentActivity } from '../../../shared/agent-types';
import type { AgentSessionState } from '../../../shared/types';

interface CardActivityLineProps {
  activity: AgentActivity | undefined;
  agentState: AgentSessionState | undefined;
  isSessionStale?: boolean;
  phaseLabel?: string;
  phaseTone?: 'neutral' | 'accent' | 'info' | 'warning' | 'danger' | 'success';
  phaseBusy?: boolean;
}

function ActivityIcon({ type, status }: { type: AgentActivity['type']; status?: AgentActivity['status'] }) {
  if (status === 'running') {
    // Spinning indicator
    return (
      <svg className="w-3 h-3 text-accent" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === 'failed') {
    return (
      <svg className="w-3 h-3 text-red-400" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM6.354 5.646a.5.5 0 1 0-.708.708L7.293 8l-1.647 1.646a.5.5 0 0 0 .708.708L8 8.707l1.646 1.647a.5.5 0 0 0 .708-.708L8.707 8l1.647-1.646a.5.5 0 0 0-.708-.708L8 7.293 6.354 5.646Z" />
      </svg>
    );
  }
  if (status === 'success') {
    return (
      <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.354 5.354-4 4a.5.5 0 0 1-.708 0l-2-2a.5.5 0 1 1 .708-.708L7 9.293l3.646-3.647a.5.5 0 0 1 .708.708Z" />
      </svg>
    );
  }

  // Type-based default icons
  if (type === 'thinking') {
    return <span className="w-3 h-3 flex items-center justify-center text-text-muted text-[10px]">...</span>;
  }

  return (
    <svg className="w-3 h-3 text-text-muted" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

function phaseToneClass(tone: NonNullable<CardActivityLineProps['phaseTone']>): string {
  switch (tone) {
    case 'accent': return 'text-accent';
    case 'info': return 'text-info';
    case 'warning': return 'text-amber-500';
    case 'danger': return 'text-red-400';
    case 'success': return 'text-emerald-400';
    case 'neutral': return 'text-text-muted';
  }
}

export const CardActivityLine = memo(function CardActivityLine({
  activity,
  agentState,
  isSessionStale = false,
  phaseLabel,
  phaseTone = 'neutral',
  phaseBusy = false,
}: CardActivityLineProps) {
  const isSessionLive =
    !isSessionStale &&
    (agentState === 'starting' || agentState === 'working' || agentState === 'waiting_for_input');

  // Failed state
  if (agentState === 'failed') {
    return (
      <div className="flex items-center gap-1.5 mt-1.5 text-tiny text-red-400 truncate">
        <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM6.354 5.646a.5.5 0 1 0-.708.708L7.293 8l-1.647 1.646a.5.5 0 0 0 .708.708L8 8.707l1.646 1.647a.5.5 0 0 0 .708-.708L8.707 8l1.647-1.646a.5.5 0 0 0-.708-.708L8 7.293 6.354 5.646Z" />
        </svg>
        <span className="truncate">{activity?.summary || 'Agent failed'}</span>
      </div>
    );
  }

  // Stopped state
  if (agentState === 'stopped') {
    return (
      <div className="flex items-center gap-1.5 mt-1.5 text-tiny text-text-muted truncate">
        <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <rect x="4" y="4" width="8" height="8" rx="1" />
        </svg>
        <span className="truncate">Stopped by user</span>
      </div>
    );
  }

  if (isSessionStale) {
    return (
      <div className="flex items-center gap-1.5 mt-1.5 text-tiny text-amber-500 truncate">
        <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm-.5 3a.5.5 0 0 1 1 0v4a.5.5 0 0 1-1 0V4Zm.5 7.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
        </svg>
        <span className="truncate">{activity ? `No recent activity. Last: ${activity.summary}` : 'No recent activity'}</span>
      </div>
    );
  }

  if (phaseLabel) {
    return (
      <div className="mt-1.5 flex min-w-0 items-center gap-1.5 truncate text-tiny text-text-muted">
        {phaseBusy ? (
          <svg className="h-3 w-3 shrink-0 animate-spin text-accent" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
            <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <span className={`h-2 w-2 shrink-0 rounded-full bg-current ${phaseToneClass(phaseTone)}`} />
        )}
        <span className={`min-w-0 truncate font-medium ${phaseToneClass(phaseTone)}`}>{phaseLabel}</span>
      </div>
    );
  }

  // Starting state (no activity yet)
  if (agentState === 'starting' && !activity) {
    return (
      <div className="mt-1.5 flex min-w-0 items-center gap-1.5 truncate text-tiny text-text-muted">
        <svg className="w-3 h-3 animate-spin text-accent shrink-0" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
          <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="truncate">Starting agent...</span>
      </div>
    );
  }

  // No activity yet
  if (!activity) return null;

  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-1.5 truncate text-tiny text-text-muted">
      <span className="shrink-0">
        {phaseBusy || (activity.status === 'running' && isSessionLive) ? (
          <svg className="w-3 h-3 animate-spin text-accent" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
            <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <ActivityIcon type={activity.type} status={activity.status} />
        )}
      </span>
      <span className="min-w-0 truncate">{activity.summary}</span>
    </div>
  );
});
