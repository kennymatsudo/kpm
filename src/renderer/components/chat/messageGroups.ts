import type { MessageSegment } from '../../stores';

export type SegmentGroup =
  | { kind: 'process'; segments: MessageSegment[]; hasAnswer: boolean; durationMs?: number }
  | { kind: 'narration'; content: string }
  | { kind: 'text'; content: string }
  | { kind: 'checkpoint'; gapMs: number | null; model?: string };

/**
 * Split segments into render groups, one turn at a time (`checkpoint` segments
 * delimit turns inside a merged message — see `finalizeMessage` in
 * streamingSlice.ts).
 *
 * Within a turn, every activity/thinking segment collapses into a single
 * `process` group positioned where the turn's *last* tool batch ran. Text
 * before that point is `narration` (the model reporting findings as it goes);
 * text after it is the turn's answer and stays a `text` group. Because the
 * producer strictly alternates text and activity segments
 * (`appendTextToSegments` in chatStreamReducer.ts), hoisting the earlier tool
 * batches down to that position never reorders prose against prose, and the
 * answer never moves when the turn finalizes.
 *
 * A turn with no tool calls emits its text as `text` groups and no process
 * group at all, so ordinary conversational replies are untouched.
 */
export function groupSegmentsForRender(
  segments: MessageSegment[],
  startTimestamp?: number
): SegmentGroup[] {
  const groups: SegmentGroup[] = [];
  let turn: MessageSegment[] = [];
  let previousTimestamp = startTimestamp ?? null;

  for (const seg of segments) {
    if (seg.type !== 'checkpoint') {
      turn.push(seg);
      continue;
    }

    const processIndex = emitTurn(turn, groups);
    turn = [];
    // The checkpoint describes the turn that just ended, so its duration
    // belongs to that turn's strip rather than the divider below it.
    if (processIndex !== -1 && seg.durationMs != null) {
      (groups[processIndex] as Extract<SegmentGroup, { kind: 'process' }>).durationMs =
        seg.durationMs;
    }
    const gapMs =
      previousTimestamp != null ? Math.max(0, seg.timestamp - previousTimestamp) : null;
    groups.push({ kind: 'checkpoint', gapMs, ...(seg.model ? { model: seg.model } : {}) });
    previousTimestamp = seg.timestamp;
  }

  emitTurn(turn, groups);
  return groups;
}

/** Append one turn's groups. Returns the index of the process group, or -1. */
function emitTurn(segments: MessageSegment[], groups: SegmentGroup[]): number {
  const lastProcessIndex = segments.reduce(
    (last, seg, idx) => (hasProcessContent(seg) ? idx : last),
    -1
  );

  if (lastProcessIndex === -1) {
    for (const seg of segments) {
      if (seg.type === 'text' && seg.content.trim().length > 0) {
        groups.push({ kind: 'text', content: seg.content });
      }
    }
    return -1;
  }

  for (const seg of segments.slice(0, lastProcessIndex)) {
    if (seg.type === 'text' && seg.content.trim().length > 0) {
      groups.push({ kind: 'narration', content: seg.content });
    }
  }

  const answer = segments
    .slice(lastProcessIndex + 1)
    .filter((seg) => seg.type === 'text' && seg.content.trim().length > 0);

  const processIndex = groups.length;
  groups.push({
    kind: 'process',
    segments: segments.filter((seg) => seg.type === 'thinking' || seg.type === 'activity'),
    hasAnswer: answer.length > 0,
  });

  for (const seg of answer) {
    if (seg.type === 'text') groups.push({ kind: 'text', content: seg.content });
  }

  return processIndex;
}

function hasProcessContent(segment: MessageSegment): boolean {
  if (segment.type === 'thinking') return segment.content.trim().length > 0;
  if (segment.type === 'activity') return segment.activities.length > 0;
  return false;
}
