import { describe, expect, it } from 'vitest';
import type { MessageSegment } from '../../stores';
import {
  buildTurnRenderPlan,
  type LiveProcess,
  type TurnRenderNode,
  type TurnRenderPlan,
} from './turnRenderPlan';

const live: LiveProcess = { activities: [], elapsedSeconds: 3 };

const turnWithTools: MessageSegment[] = [
  { type: 'text', content: 'Let me read the file.' },
  { type: 'activity', activities: [{ id: 'a1', type: 'read', label: 'Reading file' }] },
  { type: 'text', content: 'It uses a webhook.' },
  { type: 'activity', activities: [{ id: 'a2', type: 'edit', label: 'Editing file' }] },
  { type: 'text', content: 'Here is the answer.' },
];

const proseShape = (plan: TurnRenderPlan) =>
  plan.nodes
    .filter((node): node is Extract<TurnRenderNode, { kind: 'prose' }> => node.kind === 'prose')
    .map(({ key, tone, content }) => ({ key, tone, content }));

const processNodes = (plan: TurnRenderPlan) =>
  plan.nodes.filter(
    (node): node is Extract<TurnRenderNode, { kind: 'process' }> => node.kind === 'process'
  );

describe('buildTurnRenderPlan', () => {
  it('gives a streaming turn and its finalized self the same prose nodes, so finalizing rebuilds nothing', () => {
    const streaming = buildTurnRenderPlan({ segments: turnWithTools, live });
    const finalized = buildTurnRenderPlan({ segments: turnWithTools, durationMs: 4000 });

    expect(proseShape(streaming)).toEqual(proseShape(finalized));
  });

  it('keeps the process node key stable across the move, so the strip relocates instead of remounting', () => {
    const streaming = buildTurnRenderPlan({ segments: turnWithTools, live });
    const finalized = buildTurnRenderPlan({ segments: turnWithTools });

    expect(processNodes(streaming).map((node) => node.key)).toEqual(['process-0']);
    expect(processNodes(finalized).map((node) => node.key)).toEqual(['process-0']);
    expect(streaming.nodes.at(-1)?.kind).toBe('process');
  });

  it('marks only the trailing answer as appending, and only while streaming', () => {
    const streaming = buildTurnRenderPlan({ segments: turnWithTools, live });
    const finalized = buildTurnRenderPlan({ segments: turnWithTools });

    const appending = (plan: TurnRenderPlan) =>
      plan.nodes.filter((node) => node.kind === 'prose' && node.appending).map((node) => node.key);

    expect(appending(streaming)).toEqual(['prose-0-2']);
    expect(appending(finalized)).toEqual([]);
  });

  it('does not mark narration as appending when the turn is mid tool batch', () => {
    const segments = turnWithTools.slice(0, 4);
    const plan = buildTurnRenderPlan({ segments, live });

    expect(plan.nodes.filter((node) => node.kind === 'prose' && node.appending)).toEqual([]);
    expect(plan.nodes.at(-1)).toMatchObject({ kind: 'process', live });
  });

  it('keeps settled node keys identical as the turn streams in', () => {
    const final = buildTurnRenderPlan({ segments: turnWithTools }).nodes.map((node) => node.key);

    for (let length = 1; length <= turnWithTools.length; length++) {
      const prefix = buildTurnRenderPlan({ segments: turnWithTools.slice(0, length), live });
      for (const key of prefix.nodes.map((node) => node.key)) {
        expect(final).toContain(key);
      }
    }
  });

  it('synthesizes a working indicator for a tool-free turn that has none of its own', () => {
    const plan = buildTurnRenderPlan({ segments: [{ type: 'text', content: 'Yes.' }], live });

    expect(plan.nodes).toEqual([
      { key: 'prose-0-0', kind: 'prose', tone: 'answer', content: 'Yes.', appending: true },
      { key: 'process-0', kind: 'process', segments: [], hasAnswer: true, live },
    ]);
    expect(buildTurnRenderPlan({ segments: [{ type: 'text', content: 'Yes.' }] }).nodes).toEqual([
      { key: 'prose-0-0', kind: 'prose', tone: 'answer', content: 'Yes.', appending: false },
    ]);
  });

  it('numbers keys per turn so a merged message does not reuse them across checkpoints', () => {
    const segments: MessageSegment[] = [
      { type: 'text', content: 'First answer.' },
      { type: 'checkpoint', timestamp: 5000, durationMs: 3000 },
      { type: 'text', content: 'Second answer.' },
    ];

    expect(buildTurnRenderPlan({ segments, startTimestamp: 1000 }).nodes.map((n) => n.key)).toEqual([
      'prose-0-0',
      'checkpoint-0',
      'prose-1-0',
    ]);
  });

  it('drops prose left empty by plan-block stripping and reports the update instead', () => {
    const segments: MessageSegment[] = [
      { type: 'text', content: '```json:plan\n{"x":1}\n```' },
      { type: 'text', content: 'Updated the plan.' },
    ];

    const plan = buildTurnRenderPlan({ segments });

    expect(plan.nodes.map((node) => node.key)).toEqual(['prose-0-0']);
    expect(plan.hasPlanUpdate).toBe(true);
    expect(plan.copyText).toBe('Updated the plan.');
  });
});
