/**
 * Plan reference token: `@plan/<uuid>`.
 *
 * A structural primitive that resolves to a `PlanItem`. Pure functions only —
 * callable from both renderer (chip rendering, hover) and main (context
 * expansion, codec extension). Never imports from a host environment.
 */

import type { PlanItem } from './base-types';

/**
 * Minimum shape `expandPlanRefs` needs from each item — just an id. Using a
 * structural minimum lets the function accept either the narrower
 * `shared/types.ts` PlanItem or the looser base-types PlanItem.
 */
type RefResolvable = Pick<PlanItem, 'id'>;

/**
 * UUIDv4 strict (RFC 4122 §4.4): version digit `4`, variant nibble `8|9|a|b`.
 * Case-insensitive — refs may be authored in either case but are normalized
 * downstream. The leading `@plan/` is literal.
 *
 * Capture group 1 is the UUID itself.
 */
const UUID_V4 =
  '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

export const PLAN_REF_REGEX = new RegExp(`@plan\\/(${UUID_V4})`, 'gi');

/** Detect a fenced code block opener/closer: ``` or ~~~ at line start. */
const FENCE_REGEX = /^(```|~~~)/;

/** A located ref match with absolute start/end offsets in the source string. */
export interface PlanRefMatch {
  id: string;
  /** Inclusive start offset of the leading `@`. */
  start: number;
  /** Exclusive end offset (one past the last character of the UUID). */
  end: number;
}

/** A ref resolved against a plan-items map. `item` is null for unknown UUIDs. */
export interface ExpandedRef<TItem extends RefResolvable = PlanItem> extends PlanRefMatch {
  item: TItem | null;
}

/** A single segment of a tokenized string. */
export type RefSegment =
  | { type: 'text'; value: string }
  | { type: 'ref'; id: string; start: number; end: number };

/**
 * Build a `@plan/<uuid>` token. Lowercases the UUID for canonical form even
 * though matching is case-insensitive, so persisted output stays consistent.
 */
export function serializeRef(id: string): string {
  return `@plan/${id.toLowerCase()}`;
}

/**
 * Find every `@plan/<uuid>` match in `text`, skipping fenced code blocks
 * (``` and ~~~). Returns matches in document order.
 *
 * Inline code spans (single backticks) are intentionally NOT skipped — agents
 * sometimes wrap a ref in backticks for emphasis and we still want to resolve
 * it. Only fenced blocks are treated as opaque.
 */
export function findRefs(text: string): PlanRefMatch[] {
  const skipRanges = computeFencedCodeRanges(text);
  const out: PlanRefMatch[] = [];

  PLAN_REF_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PLAN_REF_REGEX.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (isInRanges(start, skipRanges)) continue;
    out.push({ id: m[1].toLowerCase(), start, end });
  }
  return out;
}

/**
 * Split `text` into an alternating sequence of text and ref segments. Useful
 * for rendering: walk the array, emit a text node or a chip for each entry.
 *
 * Refs inside fenced code blocks are returned as part of surrounding text
 * segments, never as `ref` segments.
 */
export function tokenizeRefs(text: string): RefSegment[] {
  const matches = findRefs(text);
  if (matches.length === 0) {
    return text.length === 0 ? [] : [{ type: 'text', value: text }];
  }

  const segments: RefSegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, match.start) });
    }
    segments.push({
      type: 'ref',
      id: match.id,
      start: match.start,
      end: match.end,
    });
    cursor = match.end;
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }
  return segments;
}

/**
 * Resolve every ref in `text` against the supplied plan items. Unknown ids
 * resolve to `{ item: null }` so callers can render them as broken or surface
 * a validation error.
 *
 * Refs inside fenced code blocks are not expanded.
 */
export function expandPlanRefs<TItem extends RefResolvable>(
  text: string,
  planItems: readonly TItem[],
): ExpandedRef<TItem>[] {
  const matches = findRefs(text);
  if (matches.length === 0) return [];

  const byId = new Map<string, TItem>();
  for (const item of planItems) {
    byId.set(item.id.toLowerCase(), item);
  }

  return matches.map((match) => ({
    ...match,
    item: byId.get(match.id) ?? null,
  }));
}

interface Range {
  start: number;
  end: number;
}

/**
 * Compute character ranges (start inclusive, end exclusive) covered by fenced
 * code blocks. A fence is ``` or ~~~ at the start of a line; the matching
 * closer is the same marker on its own line. An unterminated fence runs to
 * end-of-text.
 */
function computeFencedCodeRanges(text: string): Range[] {
  const ranges: Range[] = [];
  const lines = text.split('\n');
  let offset = 0;
  let fenceMarker: string | null = null;
  let fenceStart = 0;

  for (const line of lines) {
    const lineLen = line.length;
    if (fenceMarker === null) {
      if (fenceMatch) {
        fenceMarker = fenceMatch[1];
        fenceStart = offset;
      }
    } else if (fenceMatch && line.trimEnd() === fenceMarker) {
      ranges.push({ start: fenceStart, end: offset + lineLen });
      fenceMarker = null;
    }
    offset += lineLen + 1; // +1 for the consumed '\n'
  }

  if (fenceMarker !== null) {
    ranges.push({ start: fenceStart, end: text.length });
  }
  return ranges;
}

function isInRanges(pos: number, ranges: Range[]): boolean {
  for (const r of ranges) {
    if (pos >= r.start && pos < r.end) return true;
  }
  return false;
}
