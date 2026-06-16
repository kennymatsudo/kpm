import { useEffect, useState, type RefObject } from 'react';
import type { DocHeading } from '../../utils/markdown';

const HEADING_SELECTOR = 'h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]';

/**
 * Tracks reading progress and the active heading for the Focus Mode reader.
 *
 * - `progress` is the scroll fraction (0–1) of the scroll container.
 * - `activeId` is the topmost heading currently within the upper band of the
 *   viewport (scroll-spy), driven by an IntersectionObserver scoped to the
 *   scroll container.
 *
 * Pass `contentKey` (e.g. the document content) so the observer re-binds when
 * the rendered headings change.
 */
export function useReadingProgress(
  scrollRef: RefObject<HTMLElement | null>,
  headings: DocHeading[],
  contentKey: string
): { activeId: string | null; progress: number } {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Scroll progress.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef, contentKey]);

  // Scroll-spy: highlight the topmost heading in the upper viewport band.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || headings.length === 0) return;
    const nodes = Array.from(el.querySelectorAll<HTMLElement>(HEADING_SELECTOR));
    if (nodes.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const topmost = nodes.find((n) => visible.has(n.id));
        if (topmost) setActiveId(topmost.id);
      },
      // Only count a heading as "active" while it sits in the top ~30% of the
      // reader, so the highlight tracks what you're reading, not what's leaving.
      { root: el, rootMargin: '0px 0px -70% 0px', threshold: 0 }
    );
    nodes.forEach((n) => observer.observe(n));
    setActiveId((cur) => cur ?? nodes[0].id);
    return () => observer.disconnect();
  }, [scrollRef, headings, contentKey]);

  return { activeId, progress };
}
