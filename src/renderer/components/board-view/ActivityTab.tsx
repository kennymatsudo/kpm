/**
 * ActivityTab - Narrative activity feed for an agent session.
 *
 * Groups tool calls under the narration text Claude writes before them, so the
 * log reads as a sequence of stated intentions + supporting evidence rather than
 * a flat list of tool names. Orphan tool calls (before Claude writes any
 * narration) appear flat at the top. Errors and system events are inlined where
 * they occur in the timeline.
 *
 * Auto-scroll is non-stealing: only jumps to bottom if the user is already
 * near the bottom, so they can freely scroll up to review history while
 * the session is still running.
 */

import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { AgentActivity } from '../../../shared/agent-types';
import type { AgentSessionState } from '../../../shared/types';

interface ActivityTabProps {
  activities: AgentActivity[];
  agentState?: AgentSessionState;
  sessionLabel?: string;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// =============================================================================
// Signal filter
// =============================================================================

const NOISE_TOOLS = new Set([
  'read_file', 'Read',
  'grep', 'Grep',
  'glob', 'Glob',
  'list_directory',
]);

const BASH_EXPLORATION_RE = /^(ls|find|cat|head|tail|wc|tree|echo|pwd|which)(\s|$)/;

function isSignificant(activity: AgentActivity): boolean {
  if (activity.type === 'error' || activity.type === 'system') return true;
  if (
    activity.type === 'message' ||
    activity.type === 'thinking' ||
    activity.type === 'tool_result'
  ) {
    return false;
  }
  if (activity.type === 'tool_use') {
    const shortName = (activity.toolName ?? '').replace(/^mcp__\w+__/, '');
    if (NOISE_TOOLS.has(shortName)) return false;
    if ((shortName === 'Bash' || shortName === 'bash') && activity.toolInput) {
      if (BASH_EXPLORATION_RE.test(activity.toolInput.trimStart())) return false;
    }
    return true;
  }
  return false;
}

// =============================================================================
// Grouping
// =============================================================================

interface ActivityGroup {
  /** The narration Claude wrote before this batch of tool calls. Null for
   *  orphan tool calls that appear before any narration. */
  narration: AgentActivity | null;
  /** Significant tool_use, error, and system activities in order. */
  entries: AgentActivity[];
}

function groupActivities(activities: AgentActivity[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  let current: ActivityGroup = { narration: null, entries: [] };

  for (const activity of activities) {
    if (activity.type === 'message') {
      if (current.narration !== null || current.entries.length > 0) {
        groups.push(current);
      }
      current = { narration: activity, entries: [] };
    } else if (isSignificant(activity)) {
      current.entries.push(activity);
    }
  }

  if (current.narration !== null || current.entries.length > 0) {
    groups.push(current);
  }

  return groups;
}

// =============================================================================
// Icons
// =============================================================================

function ActivityIcon({ activity }: { activity: AgentActivity }) {
  if (activity.type === 'error') {
    return (
      <svg className="w-3.5 h-3.5 text-red-400 shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm-.5 3a.5.5 0 0 1 1 0v4a.5.5 0 0 1-1 0V4Zm.5 7.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
      </svg>
    );
  }
  if (activity.type === 'system') {
    return (
      <svg className="w-3.5 h-3.5 text-text-muted shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="8" r="3" opacity="0.5" />
      </svg>
    );
  }
  const shortName = (activity.toolName ?? '').replace(/^mcp__\w+__/, '');
  if (shortName === 'edit_file' || shortName === 'Edit') {
    return (
      <svg className="w-3.5 h-3.5 text-accent shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.249.249 0 0 0 .108-.064L11.19 6.25Z" />
      </svg>
    );
  }
  if (shortName === 'write_file' || shortName === 'Write') {
    return (
      <svg className="w-3.5 h-3.5 text-accent shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25V1.75Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5H3.75Zm6.75.56v2.19c0 .138.112.25.25.25h2.19L10.5 2.06Z" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5 text-text-muted shrink-0" viewBox="0 0 16 16" fill="currentColor">
      <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75Zm1.75-.25a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25H1.75ZM3.5 6.25a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1-.75-.75Zm0 2.5a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1-.75-.75ZM7 4.5A.5.5 0 0 1 7.5 4h5a.5.5 0 0 1 0 1h-5A.5.5 0 0 1 7 4.5Zm-3.5 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-1a.5.5 0 0 1-.5-.5Z" />
    </svg>
  );
}

// =============================================================================
// Narration header
// =============================================================================

const NarrationHeader = memo(function NarrationHeader({ activity }: { activity: AgentActivity }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-1.5">
      <p className="text-xs text-text-primary leading-relaxed line-clamp-3 flex-1 min-w-0">
        {activity.content || activity.summary}
      </p>
      <span className="text-tiny text-text-muted tabular-nums shrink-0 mt-0.5">
        {formatTime(activity.timestamp)}
      </span>
    </div>
  );
});

// =============================================================================
// Tool / error / system entry
// =============================================================================

const ActivityEntry = memo(function ActivityEntry({ activity }: { activity: AgentActivity }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasContent = !!activity.content;
  const isExpandable = hasContent && activity.type === 'tool_use';

  const handleToggle = useCallback(() => {
    if (isExpandable) setIsExpanded((prev) => !prev);
  }, [isExpandable]);

  return (
    <div className="group">
      <button
        onClick={handleToggle}
        className={`
          w-full flex items-start gap-2.5 px-4 py-2 text-left
          ${isExpandable ? 'hover:bg-surface-2 cursor-pointer' : 'cursor-default'}
          transition-colors
        `}
      >
        <span className="w-3 shrink-0 mt-0.5 text-text-muted">
          {isExpandable && (
            <svg
              className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </span>

        <span className="mt-0.5">
          <ActivityIcon activity={activity} />
        </span>

        <span className="flex-1 min-w-0">
          <span
            className={`text-xs leading-relaxed truncate block ${
              activity.type === 'error' ? 'text-red-400' : 'text-text-secondary'
            }`}
          >
            {activity.summary}
          </span>
        </span>

        <span className="text-tiny text-text-muted tabular-nums shrink-0 mt-0.5">
          {formatTime(activity.timestamp)}
        </span>
      </button>

      {isExpanded && activity.content && (
          <pre className="text-tiny text-text-secondary whitespace-pre-wrap break-words font-mono">
            {activity.content}
          </pre>
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Activity group
// =============================================================================

const ActivityGroupView = memo(function ActivityGroupView({ group }: { group: ActivityGroup }) {
  return (
    <div className="border-b border-border-subtle/40 last:border-0 py-0.5">
      {group.narration && <NarrationHeader activity={group.narration} />}
      {group.entries.length > 0 && (
        <div className={group.narration ? 'ml-3 border-l border-border-subtle/50' : ''}>
          {group.entries.map((entry, i) => (
            <ActivityEntry key={`${entry.timestamp}-${i}`} activity={entry} />
          ))}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// ActivityTab
// =============================================================================

export const ActivityTab = memo(function ActivityTab({
  activities,
  agentState,
  sessionLabel,
}: ActivityTabProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupActivities(activities), [activities]);

  const totalItems = useMemo(
    () => groups.reduce((n, g) => n + (g.narration ? 1 : 0) + g.entries.length, 0),
    [groups],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [totalItems]);

  if (groups.length === 0) {
    const isActive =
      agentState === 'starting' || agentState === 'working' || agentState === 'waiting_for_input';
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-text-muted">
        {isActive ? (
          <>
            <svg className="w-4 h-4 animate-spin text-accent" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
              <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </>
        ) : (
          <span className="text-xs">No activity recorded</span>
        )}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
      {sessionLabel && (
        <div className="flex items-center gap-2 px-4 py-1.5 sticky top-0 bg-surface-0/90 backdrop-blur-sm border-b border-border-subtle/40">
          <div className="flex-1 h-px bg-border-subtle/60" />
          <span className="text-tiny text-amber-500/80 font-medium uppercase tracking-wide">{sessionLabel}</span>
          <div className="flex-1 h-px bg-border-subtle/60" />
        </div>
      )}
      <div className="py-1">
        {groups.map((group, i) => (
          <ActivityGroupView key={`${group.narration?.timestamp ?? 'orphan'}-${i}`} group={group} />
        ))}
      </div>
    </div>
  );
});
