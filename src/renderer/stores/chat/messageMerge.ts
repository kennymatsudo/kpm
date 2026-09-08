import type { CheckpointSegment, MessageSegment } from '../../../shared/types';
import type { Message } from './types';

/**
 * A turn about to be appended to a session's message list. `interrupted` is
 * only ever known on the live path: `ChatMessage` (shared/types.ts) has no
 * column for it, so a turn reloaded from history is always passed as
 * uninterrupted here. That is lossy in one direction only — a turn that
 * live-rendered as its own bubble because it was cut short folds into its
 * predecessor after a reload. Persisting the flag is the only fix.
 */
export interface IncomingAssistantTurn {
  segments: MessageSegment[];
  /** Turn-end timestamp, ms since epoch. */
  timestamp: number;
  model?: string;
  interrupted?: boolean;
}

/**
 * True when an assistant turn ending now has nothing rendered in between it
 * and `previous`, so it belongs on the same card instead of a new bubble.
 * A model change does not break this: `mergeAssistantTurns` records the
 * outgoing turn's model on the checkpoint it inserts, so a mid-thread model
 * switch shows as a divider inside one card rather than splitting the card.
 */
export function canMergeAssistantTurn(previous: Message | undefined): boolean {
  return previous?.role === 'assistant' && !previous.interrupted;
}

function buildCheckpointSegment(previous: Message, timestamp: number): CheckpointSegment {
  return {
    type: 'checkpoint',
    timestamp,
    ...(previous.durationMs != null ? { durationMs: previous.durationMs } : {}),
    ...(previous.model ? { model: previous.model } : {}),
  };
}

/**
 * Fold `next` into `previous` when `canMergeAssistantTurn` allows it,
 * inserting a checkpoint divider that carries the turn `previous` just
 * finished. Returns null when the turn can't merge, so the caller starts a
 * new message instead.
 */
export function mergeAssistantTurns(previous: Message | undefined, next: IncomingAssistantTurn): Message | null {
  if (!canMergeAssistantTurn(previous)) return null;
  const target = previous!;

  return {
    ...target,
    segments: [...target.segments, buildCheckpointSegment(target, next.timestamp), ...next.segments],
    model: next.model ?? target.model,
    durationMs: Math.max(0, next.timestamp - target.timestamp.getTime()),
    ...(next.interrupted ? { interrupted: true } : {}),
  };
}
