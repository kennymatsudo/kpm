import type { MessageSegment } from '../../stores';

export type SegmentGroup =
  | { kind: 'process'; segments: MessageSegment[] }
  | { kind: 'text'; content: string }
  | { kind: 'checkpoint'; gapMs: number | null; model?: string };

/**
 * Split segments into ordered runs separated by text. Each text segment becomes
 * its own group; activity/thinking segments coalesce into a single process
 * group until the next text breaks the run. This is what lets a single
 * assistant turn render as alternating tool blocks and prose.
 *
 * `checkpoint` segments mark a merged turn boundary (see `finalizeMessage` in
 * streamingSlice.ts) and become a lightweight divider group carrying the gap
 * since the previous boundary — `startTimestamp` (the message's own start
 * time) anchors the gap for the first checkpoint in the list.
 */
export function groupSegmentsForRender(segments: MessageSegment[], startTimestamp?: number): SegmentGroup[] {
  const groups: SegmentGroup[] = [];
  let buffer: MessageSegment[] = [];
  let previousTimestamp = startTimestamp ?? null;

  const flushProcess = () => {
    if (buffer.length === 0) return;
    const hasContent = buffer.some(
      (s) =>
        (s.type === 'thinking' && s.content.trim().length > 0) ||
        (s.type === 'activity' && s.activities.length > 0)
    );
    if (hasContent) {
      groups.push({ kind: 'process', segments: buffer });
    }
    buffer = [];
  };

  for (const seg of segments) {
    if (seg.type === 'text') {
      flushProcess();
      if (seg.content.trim().length > 0) {
        groups.push({ kind: 'text', content: seg.content });
      }
    } else if (seg.type === 'checkpoint') {
      flushProcess();
      const gapMs = previousTimestamp != null ? Math.max(0, seg.timestamp - previousTimestamp) : null;
      groups.push({ kind: 'checkpoint', gapMs, ...(seg.model ? { model: seg.model } : {}) });
      previousTimestamp = seg.timestamp;
    } else {
      buffer.push(seg);
    }
  }
  flushProcess();
  return groups;
}
