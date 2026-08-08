import { describe, expect, it } from 'vitest';
import type { MessageSegment } from '../../stores';
import { groupSegmentsForRender, type SegmentGroup } from './messageGroups';

type ProseGroup = Extract<SegmentGroup, { kind: 'narration' | 'text' }>;

const proseGroups = (groups: SegmentGroup[]): ProseGroup[] =>
  groups.filter((g): g is ProseGroup => g.kind === 'narration' || g.kind === 'text');

describe('groupSegmentsForRender', () => {
  it('collapses a turn into one process group, with earlier text as narration and trailing text as the answer', () => {
    const segments: MessageSegment[] = [
      { type: 'text', content: 'Let me read the file.' },
      { type: 'activity', activities: [{ id: 'a1', type: 'read', label: 'Reading file' }] },
      { type: 'text', content: 'It uses a webhook.' },
      { type: 'activity', activities: [{ id: 'a2', type: 'edit', label: 'Editing file' }] },
      { type: 'text', content: 'Here is the answer.' },
    ];

    const groups = groupSegmentsForRender(segments);

    expect(groups).toEqual([
      { kind: 'narration', content: 'Let me read the file.' },
      { kind: 'narration', content: 'It uses a webhook.' },
      { kind: 'process', segments: [segments[1], segments[3]], hasAnswer: true },
      { kind: 'text', content: 'Here is the answer.' },
    ]);
  });

  it('reports no answer when the turn ends on a tool call', () => {
    const segments: MessageSegment[] = [
      { type: 'text', content: 'Checking one more surface.' },
      { type: 'activity', activities: [{ id: 'a1', type: 'read', label: 'Reading file' }] },
    ];

    expect(groupSegmentsForRender(segments)).toEqual([
      { kind: 'narration', content: 'Checking one more surface.' },
      { kind: 'process', segments: [segments[1]], hasAnswer: false },
    ]);
  });

  it('leaves a turn with no tool calls as plain answer text', () => {
    const segments: MessageSegment[] = [{ type: 'text', content: 'Yes, that is right.' }];

    expect(groupSegmentsForRender(segments)).toEqual([
      { kind: 'text', content: 'Yes, that is right.' },
    ]);
  });

  it('folds thinking into the process group without letting it position the strip', () => {
    const segments: MessageSegment[] = [
      { type: 'thinking', content: 'considering options' },
      { type: 'activity', activities: [{ id: 'a1', type: 'read', label: 'Reading file' }] },
      { type: 'text', content: 'Done.' },
    ];

    expect(groupSegmentsForRender(segments)).toEqual([
      { kind: 'process', segments: [segments[0], segments[1]], hasAnswer: true },
      { kind: 'text', content: 'Done.' },
    ]);
  });

  it('groups each merged turn separately and takes the turn duration off its closing checkpoint', () => {
    const segments: MessageSegment[] = [
      { type: 'activity', activities: [{ id: 'a1', type: 'read', label: 'Reading file' }] },
      { type: 'text', content: 'First answer.' },
      { type: 'checkpoint', timestamp: 5000, durationMs: 3000, model: 'claude-opus-4-8' },
      { type: 'activity', activities: [{ id: 'a2', type: 'edit', label: 'Editing file' }] },
      { type: 'text', content: 'Second answer.' },
    ];

    expect(groupSegmentsForRender(segments, 1000)).toEqual([
      { kind: 'process', segments: [segments[0]], hasAnswer: true, durationMs: 3000 },
      { kind: 'text', content: 'First answer.' },
      { kind: 'checkpoint', gapMs: 4000, model: 'claude-opus-4-8' },
      { kind: 'process', segments: [segments[3]], hasAnswer: true },
      { kind: 'text', content: 'Second answer.' },
    ]);
  });

  it('settles every prose group but a trailing answer, so streaming prefixes agree with the finalized turn', () => {
    const segments: MessageSegment[] = [
      { type: 'text', content: 'Let me read the file.' },
      { type: 'activity', activities: [{ id: 'a1', type: 'read', label: 'Reading file' }] },
      { type: 'text', content: 'It uses a webhook.' },
      { type: 'activity', activities: [{ id: 'a2', type: 'edit', label: 'Editing file' }] },
      { type: 'text', content: 'Here is the answer.' },
    ];

    const finalProse = proseGroups(groupSegmentsForRender(segments));

    for (let length = 1; length <= segments.length; length++) {
      const prose = proseGroups(groupSegmentsForRender(segments.slice(0, length)));
      // A trailing answer group is still appending; everything before it has
      // taken its final kind and content and must never be reclassified.
      const settled =
        prose.at(-1)?.kind === 'text' ? prose.slice(0, prose.length - 1) : prose.slice();

      expect(settled).toEqual(finalProse.slice(0, settled.length));
    }
  });

  it('drops a whitespace-only/empty process run and computes checkpoint gaps relative to the prior boundary', () => {
    const segments: MessageSegment[] = [
      { type: 'thinking', content: '   ' },
      { type: 'activity', activities: [] },
      { type: 'checkpoint', timestamp: 5000, model: 'claude-opus-4-8' },
      { type: 'checkpoint', timestamp: 7000 },
    ];

    const groups = groupSegmentsForRender(segments, 1000);

    expect(groups).toEqual([
      { kind: 'checkpoint', gapMs: 4000, model: 'claude-opus-4-8' },
      { kind: 'checkpoint', gapMs: 2000 },
    ]);
  });
});
