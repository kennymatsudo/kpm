import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Activity, ActivityType, MessageSegment } from '../../../shared/types';
import { formatWorkedFor, summarizeActivities } from './processSummary';
import { useTurnDisclosure } from './useTurnDisclosure';

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
  /** True when the turn's answer follows this strip, which makes it the process/answer boundary. */
  hasAnswer?: boolean;
  /** Wall-clock duration of the finished turn this strip belongs to. */
  durationMs?: number;
  /** Identity used to remember whether the user opened this strip. */
  disclosureKey?: string;
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
    // A still-running tool gets a live elapsed timer (from the SDK's
    // tool_progress heartbeat) next to the pulse, so long calls don't look
    // frozen. Fast tools never report elapsed time, so they just pulse.
    return (
      <span className="flex items-center gap-1.5">
        {activity.elapsedSeconds != null && (
          <span className="font-mono text-tiny text-text-muted tabular-nums">
            {activity.elapsedSeconds}s
          </span>
        )}
        <span className="pulse-dot" style={{ width: 6, height: 6 }} aria-hidden="true" />
      </span>
    );
  }
  if (activity.diffStats) {
    const { additions, deletions } = activity.diffStats;
    return (
      <span className="font-mono text-tiny flex items-center gap-1">
        {additions > 0 && <span className="text-success">+{additions}</span>}
        {deletions > 0 && <span className="text-danger">-{deletions}</span>}
      </span>
    );
  }
  // For grep-like results, the SDK packs match counts into `detail`. Surface
  // a "0 matches" / "N matches" hint when present; otherwise use a checkmark.
  const matchHint = extractMatchHint(activity.detail);
  if (matchHint) {
    return <span className="font-mono text-text-muted">{matchHint}</span>;
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
      role="img"
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
    <div className={`${indent ? 'pl-5' : ''} py-1`}>
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
        <span className="text-text-primary flex-shrink-0">{getToolName(activity)}</span>
        {activity.label && (
          <span
            className="text-text-secondary truncate min-w-0"
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
        <div className={`collapse-reveal mt-1.5 ${indent ? 'ml-0' : 'ml-5'}`}>
          {hasHunks ? (
            <div className="px-2 py-1 bg-surface-1 border border-border-subtle/60 rounded-sm font-mono text-tiny leading-relaxed overflow-x-auto">
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
            <div className="font-mono text-tiny text-text-secondary break-all">
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
    <div className="py-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full font-mono text-xs leading-5 text-left cursor-pointer"
        aria-expanded={expanded}
      >
        <Chevron expanded={expanded} />
        <span className="text-text-primary flex-shrink-0">{toolName}</span>
        <span className="text-text-muted flex-shrink-0">×{count}</span>
        <span className="ml-auto flex-shrink-0 flex items-center">
          {isActive ? (
            <span className="pulse-dot" style={{ width: 6, height: 6 }} aria-hidden="true" />
          ) : aggDiffs.hasDiffs ? (
            <span className="font-mono text-tiny flex items-center gap-1">
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
        <div className="collapse-reveal mt-1">
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
    <div className="py-1">
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
          <span className="ml-2 pulse-dot" style={{ width: 5, height: 5 }} aria-hidden="true" />
        )}
      </button>
      {expanded && isLong && (
        <p className="collapse-reveal mt-1.5 ml-5 text-xs text-text-secondary whitespace-pre-wrap break-words">
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
        dim ? 'text-text-tertiary' : 'text-text-muted'
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
      className="w-3 h-3 flex-shrink-0 text-text-muted"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <rect x="4" y="5" width="16" height="14" rx="2" strokeWidth={1.5} />
      <path strokeWidth={1.5} strokeLinecap="round" d="M8 10h6M8 14h4" />
    </svg>
  );
});

/** Caps how tall an expanded strip can grow, so collapsing it never moves the answer far. */
const EXPANDED_BODY_MAX_HEIGHT = 'max-h-80';

export const ProcessTimeline = memo(function ProcessTimeline({
  segments,
  streamingThinking,
  streamingActivities,
  isStreaming = false,
  elapsedSeconds,
  hasAnswer = false,
  durationMs,
  disclosureKey,
}: ProcessTimelineProps) {
  const steps = useMemo(
    () => buildSteps({ segments, streamingThinking, streamingActivities }),
    [segments, streamingThinking, streamingActivities],
  );
  const rows = useMemo(() => collapseToolRuns(steps), [steps]);

  const [expanded, toggleExpanded] = useTurnDisclosure(disclosureKey);

  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isStreaming || !expanded) return;
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [isStreaming, expanded, rows.length]);

  const summary = useMemo(
    () => summarizeActivities(steps.flatMap((s) => (s.kind === 'tool' ? [s.activity] : []))),
    [steps]
  );

  if (steps.length === 0 && !isStreaming) return null;

  const durationSeconds = isStreaming
    ? elapsedSeconds
    : durationMs != null
      ? Math.round(durationMs / 1000)
      : elapsedSeconds;
  const phrases =
    summary.parts.length > 0
      ? summary.parts
      : steps.some((s) => s.kind === 'thought')
        ? ['thinking']
        : [];
  const label = [formatWorkedFor(durationSeconds, isStreaming), ...phrases]
    .filter(Boolean)
    .join(' · ');
  const hasDiff = summary.additions > 0 || summary.deletions > 0;

  return (
    <div
      className={`chat-process-channel ${hasAnswer ? 'mt-3 mb-5' : 'my-3'}`}
    >
      <button
        type="button"
        onClick={toggleExpanded}
        disabled={steps.length === 0}
        className="w-full flex items-center gap-2 py-1.5 font-mono text-tiny text-text-muted hover:text-text-secondary transition-colors text-left"
        aria-expanded={expanded}
        // The pulse dot is the only "still alive" signal on screen and has no
        // text of its own, so the state rides on the button's own name.
        aria-label={`${label || 'Working'}${isStreaming ? ', still running' : ''}`}
      >
        <span className="chat-process-marker" aria-hidden="true">
          {steps.length === 0 ? (
            <span className="pulse-dot block" style={{ width: 6, height: 6 }} />
          ) : (
            <Chevron expanded={expanded} />
          )}
        </span>
        <span className="truncate">{label || 'Working'}</span>
        {hasDiff && (
          <span className="ml-auto flex-shrink-0 font-mono flex items-center gap-1">
            {summary.additions > 0 && <span className="text-success">+{summary.additions}</span>}
            {summary.deletions > 0 && <span className="text-danger">-{summary.deletions}</span>}
          </span>
        )}
        {isStreaming && steps.length > 0 && (
          <span
            className={`pulse-dot flex-shrink-0 ${hasDiff ? '' : 'ml-auto'}`}
            style={{ width: 6, height: 6 }}
            aria-hidden="true"
          />
        )}
      </button>
      {expanded && steps.length > 0 && (
        <div
          ref={bodyRef}
          className={`${EXPANDED_BODY_MAX_HEIGHT} overflow-y-auto pb-1`}
        >
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
      )}
    </div>
  );
});
