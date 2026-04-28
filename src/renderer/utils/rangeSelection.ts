export type OrderedIdsGetter = () => string[];
export type RangeSelectHandler = (targetId: string, orderedIds: readonly string[]) => void;

export function getContiguousRange(
  orderedIds: readonly string[],
  anchorId: string | null,
  targetId: string,
): string[] | null {
  if (anchorId === null) return null;

  const anchorIndex = orderedIds.indexOf(anchorId);
  const targetIndex = orderedIds.indexOf(targetId);
  if (anchorIndex < 0 || targetIndex < 0) return null;

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return orderedIds.slice(start, end + 1);
}
