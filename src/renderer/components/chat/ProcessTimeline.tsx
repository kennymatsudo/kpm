import { memo, useEffect, useMemo, useState } from 'react';
import type { Activity, ActivityType, MessageSegment } from '../../../shared/types';

type Step =
  | { kind: 'thought'; content: string; key: string }
  | { kind: 'tool'; activity: Activity; key: string };

/** A grouped run of consecutive same-type tool calls. */
interface ToolGroup {
  kind: 'toolGroup';
  activities: Activity[];
  key: string;
}
type RenderRow =
  | { kind: 'thought'; content: string; key: string }
  | { kind: 'tool'; activity: Activity; key: string }
  | ToolGroup;

interface ProcessTimelineProps {
  /** Finalized message segments. */
  segments?: MessageSegment[];
  /** In-flight thinking text accumulator. */
  streamingThinking?: string;
  /** Currently running/recent activities (live). */
  streamingActivities?: Activity[];
  isStreaming?: boolean;
  elapsedSeconds?: number | null;
}

const TOOL_NAME_BY_TYPE: Record<ActivityType, string> = {
  read: 'read_file',
  edit: 'edit',
  search: 'grep',
  glob: 'glob',
  command: 'bash',
  thinking: 'thinking',
  other: 'tool',
};

function buildSteps(props: ProcessTimelineProps): Step[] {
  const steps: Step[] = [];
  const seenToolIds = new Set<string>();

  const pushFromSegments = (segs: MessageSegment[] | undefined) => {
    if (!segs) return;
    for (const seg of segs) {
      if (seg.type === 'thinking' && seg.content.trim()) {
        steps.push({
          kind: 'thought',
          content: seg.content.trim(),
          key: `thought-${steps.length}`,
        });
      } else if (seg.type === 'activity') {
        for (const a of seg.activities) {
          if (seenToolIds.has(a.id)) continue;
          seenToolIds.add(a.id);
          steps.push({ kind: 'tool', activity: a, key: a.id ?? `tool-${steps.length}` });
        }
      }
    }
  };

  pushFromSegments(props.segments);

  // Streaming thinking surfaces as a single thought row at the top of the
  // box (the data model accumulates all reasoning into one blob).
  const streamingThinking = props.streamingThinking?.trim();
  if (streamingThinking) {
    const alreadyPresent = steps.some(
      (s) => s.kind === 'thought' && s.content === streamingThinking
    );
    if (!alreadyPresent) {
      steps.unshift({
        kind: 'thought',
        content: streamingThinking,
        key: 'thought-streaming',
      });
    }
  }

  if (props.streamingActivities) {
    for (const a of props.streamingActivities) {
      if (seenToolIds.has(a.id)) continue;
      seenToolIds.add(a.id);
      steps.push({ kind: 'tool', activity: a, key: a.id });
    }
  }

  return steps;
}

/** Collapse runs of 2+ same-type tool steps into ToolGroup rows. */
function collapseToolRuns(steps: Step[]): RenderRow[] {
  const rows: RenderRow[] = [];
  let i = 0;
  while (i < steps.length) {
    const step = steps[i];
    if (step.kind !== 'tool') {
      rows.push(step);
      i++;
      continue;
    }
    let j = i + 1;
    while (
      j < steps.length &&
      steps[j].kind === 'tool' &&
      (steps[j] as Extract<Step, { kind: 'tool' }>).activity.type === step.activity.type
    ) {
      j++;
    }
    if (j - i >= 2) {
      const activities = (steps.slice(i, j) as Extract<Step, { kind: 'tool' }>[]).map(
        (s) => s.activity
      );
      rows.push({ kind: 'toolGroup', activities, key: `group-${step.key}` });
    } else {
      rows.push(step);
    }
    i = j;
  }
  return rows;
}

function getToolName(activity: Activity): string {
  return TOOL_NAME_BY_TYPE[activity.type];
}

/** Right-aligned status indicator for a single tool row. */
function toolStatus(activity: Activity, isActive: boolean): React.ReactNode {
  if (isActive) {
  }
  if (activity.diffStats) {
    const { additions, deletions } = activity.diffStats;
    return (
      <span className="font-mono text-xxs flex items-center gap-1">
        {additions > 0 && <span className="text-success">+{additions}</span>}
        {deletions > 0 && <span className="text-danger">-{deletions}</span>}
      </span>
    );
  }
  // For grep-like results, the SDK packs match counts into `detail`. Surface
  // a "0 matches" / "N matches" hint when present; otherwise use a checkmark.
  const matchHint = extractMatchHint(activity.detail);
  if (matchHint) {
    return <span className="font-mono text-text-muted/70">{matchHint}</span>;
  }
  return <CheckIcon />;
}

function extractMatchHint(detail: string | undefined): string | null {
  if (!detail) return null;
  const m = /(\d+)\s+match(?:es)?/i.exec(detail);
  return m ? `${m[1]} match${m[1] === '1' ? '' : 'es'}` : null;
}

const THOUGHT_PREVIEW_CHARS = 240;

const CheckIcon = memo(function CheckIcon() {
  return (
    <svg
      className="w-3 h-3 text-success"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-label="completed"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M5 13l4 4L19 7" />
    </svg>
  );
});

const ToolRow = memo(function ToolRow({
  activity,
  isActive,
  indent,
}: {
  activity: Activity;
  isActive: boolean;
  indent?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasHunks = !!activity.diffHunks && activity.diffHunks.length > 0;
  const hasDetail = !!(activity.detail ?? activity.label);
  const expandable = hasHunks || hasDetail;

  return (
    <div className={`${indent ? 'pl-8 pr-3' : 'px-3'} py-1`}>
      <button
        type="button"
        onClick={expandable ? () => setExpanded((v) => !v) : undefined}
        disabled={!expandable}
        className={`flex items-center gap-2 w-full font-mono text-xs leading-5 text-left ${
          expandable ? 'cursor-pointer' : 'cursor-default'
        }`}
        aria-expanded={expandable ? expanded : undefined}
      >
        {!indent && <ToolGlyph />}
        <span className="text-accent flex-shrink-0">{getToolName(activity)}</span>
        {activity.label && (
          <span
            className="text-text-muted/80 truncate min-w-0"
            title={activity.detail ?? activity.label}
          >
            {activity.label}
          </span>
        )}
        <span className="ml-auto flex-shrink-0 flex items-center">
          {toolStatus(activity, isActive)}
        </span>
      </button>
      {expanded && expandable && (
          {hasHunks ? (
            <div className="px-2 py-1 bg-surface-1 border border-border-subtle/60 rounded font-mono text-xxs leading-relaxed overflow-x-auto">
              {activity.diffHunks!.map((line, idx) => {
                const cls = line.startsWith('+')
                  ? 'text-success'
                  : line.startsWith('-')
                    ? 'text-danger'
                    : 'text-text-muted';
                return (
                  <div key={idx} className={`whitespace-pre ${cls}`}>
                    {line || ' '}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="font-mono text-xxs text-text-muted/70 break-all">
              {activity.detail ?? activity.label}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const ToolGroupRow = memo(function ToolGroupRow({
  activities,
  isActive,
}: {
  activities: Activity[];
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = activities.length;
  const toolName = getToolName(activities[0]);

  // Aggregate diff stats across the run for a meaningful summary status.
  const aggDiffs = activities.reduce(
    (acc, a) => {
      if (a.diffStats) {
        acc.additions += a.diffStats.additions;
        acc.deletions += a.diffStats.deletions;
        acc.hasDiffs = true;
      }
      return acc;
    },
    { additions: 0, deletions: 0, hasDiffs: false }
  );

  return (
    <div className="px-3 py-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full font-mono text-xs leading-5 text-left cursor-pointer"
        aria-expanded={expanded}
      >
        <Chevron expanded={expanded} />
        <span className="text-accent flex-shrink-0">{toolName}</span>
        <span className="text-text-muted/60 flex-shrink-0">×{count}</span>
        <span className="ml-auto flex-shrink-0 flex items-center">
          {isActive ? (
            <span className="pulse-dot" style={{ width: 6, height: 6 }} />
          ) : aggDiffs.hasDiffs ? (
            <span className="font-mono text-xxs flex items-center gap-1">
              {aggDiffs.additions > 0 && (
                <span className="text-success">+{aggDiffs.additions}</span>
              )}
              {aggDiffs.deletions > 0 && (
                <span className="text-danger">-{aggDiffs.deletions}</span>
              )}
            </span>
          ) : (
            <CheckIcon />
          )}
        </span>
      </button>
      {expanded && (
          {activities.map((a, idx) => (
            <ToolRow
              key={a.id ?? `tool-inner-${idx}`}
              activity={a}
              isActive={isActive && idx === activities.length - 1}
              indent
            />
          ))}
        </div>
      )}
    </div>
  );
});

const ThoughtRow = memo(function ThoughtRow({
  content,
  isActive,
}: {
  content: string;
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > THOUGHT_PREVIEW_CHARS || content.includes('\n');

  return (
    <div className="px-3 py-1">
      <button
        type="button"
        onClick={isLong ? () => setExpanded((v) => !v) : undefined}
        disabled={!isLong}
        className={`flex items-center gap-2 w-full font-mono text-xs leading-5 text-left ${
          isLong ? 'cursor-pointer' : 'cursor-default'
        }`}
        aria-expanded={isLong ? expanded : undefined}
      >
        <Chevron expanded={expanded && isLong} dim={!isLong} />
        <span className="text-text-muted">Thinking</span>
        {!expanded && isActive && (
          <span className="ml-2 pulse-dot" style={{ width: 5, height: 5 }} />
        )}
      </button>
      {expanded && isLong && (
          {content}
        </p>
      )}
    </div>
  );
});

const Chevron = memo(function Chevron({ expanded, dim }: { expanded: boolean; dim?: boolean }) {
  return (
    <svg
      className={`w-3 h-3 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''} ${
        dim ? 'text-text-muted/30' : 'text-text-muted/70'
      }`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
});

const ToolGlyph = memo(function ToolGlyph() {
  return (
    <svg
      className="w-3 h-3 flex-shrink-0 text-text-muted/60"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <rect x="4" y="5" width="16" height="14" rx="2" strokeWidth={1.5} />
      <path strokeWidth={1.5} strokeLinecap="round" d="M8 10h6M8 14h4" />
    </svg>
  );
});

function formatDuration(sec: number | null | undefined): string | null {
  if (sec == null || sec < 0) return null;
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export const ProcessTimeline = memo(function ProcessTimeline({
  segments,
  streamingThinking,
  streamingActivities,
  isStreaming = false,
  elapsedSeconds,
}: ProcessTimelineProps) {
  const steps = useMemo(
  );
  const rows = useMemo(() => collapseToolRuns(steps), [steps]);

  // Default-expanded while streaming so the user sees live progress; auto-collapse
  // once the turn ends — the answer is the headline, the process is the footnote.
  const [expanded, setExpanded] = useState(isStreaming);
  useEffect(() => {
    setExpanded(isStreaming);
  }, [isStreaming]);

  if (steps.length === 0 && !isStreaming) return null;

  // Empty-but-streaming: show a small pulse line so the user sees activity
  // before the first thought/tool lands.
  if (steps.length === 0 && isStreaming) {
    return (
      <div className="my-2 rounded-md border border-border-subtle/60 bg-surface-2/30 px-3 py-1.5 inline-flex items-center gap-2 text-xs text-text-muted">
        <span className="pulse-dot" style={{ width: 6, height: 6 }} />
        <span className="font-mono">Working...</span>
      </div>
    );
  }

  // Build summary parts for the collapsed chip.
  const toolCount = steps.filter((s) => s.kind === 'tool').length;
  const hasThought = steps.some((s) => s.kind === 'thought');
  const summaryParts: string[] = [];
  if (toolCount > 0) summaryParts.push(`${toolCount} tool${toolCount === 1 ? '' : 's'}`);
  if (hasThought) summaryParts.push('thinking');
  const durationLabel = !isStreaming ? formatDuration(elapsedSeconds) : null;
  if (durationLabel) summaryParts.push(durationLabel);
  const summaryLabel = summaryParts.join(' · ') || 'Process';

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="my-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border-subtle/60 bg-surface-2/30 hover:bg-surface-2/60 text-xxs text-text-muted hover:text-text-secondary transition-colors max-w-full"
        aria-expanded={false}
      >
        <CheckIcon />
        <span className="truncate">{summaryLabel}</span>
        <Chevron expanded={false} />
      </button>
    );
  }

  return (
    <div className="my-2 rounded-md border border-border-subtle/60 bg-surface-2/30 overflow-hidden max-w-full">
      {!isStreaming && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-full flex items-center gap-1.5 px-3 py-1 text-xxs text-text-muted/70 hover:text-text-secondary border-b border-border-subtle/40"
          aria-expanded
        >
          <Chevron expanded />
          <span className="truncate">{summaryLabel}</span>
        </button>
      )}
      {rows.map((row, idx) => {
        const isLast = idx === rows.length - 1;
        const rowIsActive = isStreaming && isLast;
        if (row.kind === 'thought') {
          return <ThoughtRow key={row.key} content={row.content} isActive={rowIsActive} />;
        }
        if (row.kind === 'tool') {
          return <ToolRow key={row.key} activity={row.activity} isActive={rowIsActive} />;
        }
        return (
          <ToolGroupRow key={row.key} activities={row.activities} isActive={rowIsActive} />
        );
      })}
    </div>
  );
});
