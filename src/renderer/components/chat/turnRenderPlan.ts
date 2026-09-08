import type { Activity, MessageSegment } from '../../stores';
import { processMessageContent } from '../../utils/messageFormatter';
import { groupSegmentsForRender } from './messageGroups';

/** What only an in-flight turn has. Its presence on the input is what marks a turn as streaming. */
export interface LiveProcess {
  activities: Activity[];
  thinking?: string;
  elapsedSeconds: number | null;
}

export interface TurnRenderInput {
  segments: MessageSegment[];
  /** Anchors the gap shown by the first checkpoint divider. */
  startTimestamp?: number;
  /** Duration of the final turn; earlier turns carry theirs on their closing checkpoint. */
  durationMs?: number;
  live?: LiveProcess;
  /** Identity of the message this turn belongs to. Only used to namespace
   * `disclosureKey`, so a strip's open/closed state survives the virtualizer
   * unmounting its row. */
  turnId?: string;
}

export type TurnRenderNode =
  | {
      key: string;
      kind: 'prose';
      tone: 'narration' | 'answer';
      content: string;
      /** Still receiving text. True for at most one node, and only while streaming. */
      appending: boolean;
    }
  | {
      key: string;
      kind: 'process';
      /** Globally unique across the transcript, unlike `key`, which is only
       * unique within its own turn. Absent on the in-flight turn, which has no
       * message id yet. */
      disclosureKey?: string;
      segments: MessageSegment[];
      hasAnswer: boolean;
      durationMs?: number;
      live: LiveProcess | null;
    }
  | { key: string; kind: 'checkpoint'; gapMs: number | null; model?: string };

export interface TurnRenderPlan {
  /** Render order. Callers map over this and must not reorder it. */
  nodes: TurnRenderNode[];
  /** Turn text with plan blocks stripped, for the copy affordance. */
  copyText: string;
  hasPlanUpdate: boolean;
}

/**
 * Build the ordered node list for one assistant turn, streaming or finalized.
 *
 * Both phases go through here so a turn's node sequence, keys, and roles stay
 * the same when it finalizes and the DOM does not have to be rebuilt. Keys are
 * turn-relative rather than array-index-relative so they survive both that
 * transition and the strip changing position within the plan.
 *
 * The one deliberate difference between the phases: while `live` is set the
 * live process node is placed last, keeping the strip pinned below the prose
 * so a new tool batch never reflows text already on screen. A tool-free turn
 * still gets a synthesized live node for its working indicator, which is the
 * one thing that legitimately disappears on finalize.
 */
export function buildTurnRenderPlan({
  segments,
  startTimestamp,
  durationMs,
  live,
  turnId,
}: TurnRenderInput): TurnRenderPlan {
  const groups = groupSegmentsForRender(segments, startTimestamp);
  const lastProcessIndex = groups.reduce(
    (last, group, idx) => (group.kind === 'process' ? idx : last),
    -1
  );

  const nodes: TurnRenderNode[] = [];
  const copyParts: string[] = [];
  let hasPlanUpdate = false;
  let turnIndex = 0;
  let proseIndex = 0;

  groups.forEach((group, idx) => {
    if (group.kind === 'checkpoint') {
      nodes.push({
        key: `checkpoint-${turnIndex}`,
        kind: 'checkpoint',
        gapMs: group.gapMs,
        ...(group.model ? { model: group.model } : {}),
      });
      turnIndex += 1;
      proseIndex = 0;
      return;
    }

    if (group.kind === 'process') {
      nodes.push({
        key: `process-${turnIndex}`,
        ...(turnId ? { disclosureKey: `${turnId}:process-${turnIndex}` } : {}),
        kind: 'process',
        segments: group.segments,
        hasAnswer: group.hasAnswer,
        durationMs: group.durationMs ?? (idx === lastProcessIndex ? durationMs : undefined),
        live: live && idx === lastProcessIndex ? live : null,
      });
      return;
    }

    const processed = processMessageContent(group.content);
    if (processed.hasPlanUpdate) hasPlanUpdate = true;
    if (!processed.displayContent) return;

    copyParts.push(processed.displayContent);
    // Tone stays off the key. A segment flips from answer to narration the
    // moment a later tool batch lands, and keying on tone would remount it.
    nodes.push({
      key: `prose-${turnIndex}-${proseIndex}`,
      kind: 'prose',
      tone: group.kind === 'narration' ? 'narration' : 'answer',
      content: processed.displayContent,
      appending: false,
    });
    proseIndex += 1;
  });

  return {
    nodes: live ? withLiveTurn(nodes, live, turnIndex) : nodes,
    copyText: copyParts.join('\n\n'),
    hasPlanUpdate,
  };
}

/** Pin the live strip below the prose and mark the group still taking text. */
function withLiveTurn(
  nodes: TurnRenderNode[],
  live: LiveProcess,
  turnIndex: number
): TurnRenderNode[] {
  const liveProcess = nodes.find(
    (node): node is Extract<TurnRenderNode, { kind: 'process' }> =>
      node.kind === 'process' && node.live !== null
  );
  const unpinned = liveProcess ? nodes.filter((node) => node !== liveProcess) : nodes;

  const appendingIndex = unpinned.reduce(
    (last, node, idx) => (node.kind === 'prose' && node.tone === 'answer' ? idx : last),
    -1
  );
  const placed = unpinned.map((node, idx) =>
    idx === appendingIndex ? { ...node, appending: true } : node
  );

  placed.push(
    liveProcess ?? {
      key: `process-${turnIndex}`,
      kind: 'process',
      segments: [],
      hasAnswer: appendingIndex !== -1,
      live,
    }
  );
  return placed;
}
