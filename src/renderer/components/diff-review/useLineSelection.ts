import { useCallback, useEffect, useState } from 'react';

export interface LineRange {
  start: number;
  end: number;
}

/** Row-index range selection: drag across rows, or shift-click to extend. */
export function useLineSelection() {
  const [anchor, setAnchor] = useState<number | null>(null);
  const [head, setHead] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Set when a drag or shift-click finishes, which opens the comment box. */
  const [committed, setCommitted] = useState<LineRange | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, [dragging]);

  const start = useCallback(
    (index: number, shift: boolean) => {
      setCommitted(null);
      if (shift && anchor !== null) {
        setHead(index);
        setCommitted({
          start: Math.min(anchor, index),
          end: Math.max(anchor, index),
        });
        return;
      }
      setAnchor(index);
      setHead(index);
      setDragging(true);
    },
    [anchor],
  );

  const extend = useCallback(
    (index: number) => {
      if (dragging) setHead(index);
    },
    [dragging],
  );

  const finish = useCallback(() => {
    if (!dragging || anchor === null || head === null) return;
    setDragging(false);
    setCommitted({
      start: Math.min(anchor, head),
      end: Math.max(anchor, head),
    });
  }, [dragging, anchor, head]);

  const clear = useCallback(() => {
    setAnchor(null);
    setHead(null);
    setDragging(false);
    setCommitted(null);
  }, []);

  const live: LineRange | null =
    anchor !== null && head !== null ? { start: Math.min(anchor, head), end: Math.max(anchor, head) } : null;

  return { selection: live, committed, start, extend, finish, clear };
}
