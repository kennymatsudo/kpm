import { describe, expect, it } from 'vitest';
import type { MessageSegment } from '../../stores';
import { groupSegmentsForRender } from './messageGroups';

describe('groupSegmentsForRender', () => {
  it('coalesces consecutive activity/thinking segments into one process group, split by text', () => {
    const segments: MessageSegment[] = [
      { type: 'activity', activities: [{ id: 'a1', type: 'read', label: 'Reading file' }] },
      { type: 'thinking', content: 'considering options' },
      { type: 'text', content: 'Here is the answer.' },
      { type: 'activity', activities: [{ id: 'a2', type: 'edit', label: 'Editing file' }] },
    ];

    const groups = groupSegmentsForRender(segments);

    expect(groups).toEqual([
      { kind: 'process', segments: [segments[0], segments[1]] },
      { kind: 'text', content: 'Here is the answer.' },
      { kind: 'process', segments: [segments[3]] },
    ]);
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
