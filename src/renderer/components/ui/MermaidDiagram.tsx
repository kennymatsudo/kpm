import { createPortal } from 'react-dom';
import purify from 'dompurify';
import mermaid from 'mermaid';
import { useTheme } from '../../contexts';
import { CloseIcon } from '../icons';

interface MermaidDiagramProps {
  source: string;
}

const SCALE_MIN = 0.1;
const SCALE_MAX = 4;
const SCALE_STEP = 1.15;
const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict' as const,
  flowchart: {
    htmlLabels: false,
  },
};

export function MermaidDiagram({ source }: MermaidDiagramProps) {
  const rawId = useId();
  const id = `mermaid${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const { resolvedTheme } = useTheme();

  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  // Hidden at scale=1 until we've measured the SVG and computed the fit scale.
  const [overlayReady, setOverlayReady] = useState(false);

  const dragOrigin = useRef<{ mouseX: number; mouseY: number; tx: number; ty: number } | null>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!source.trim()) return;
    let cancelled = false;
    setSvg(null);
    setError(false);
    mermaid.render(id, source)
      .then(({ svg: rendered }) => {
        if (!cancelled) setSvg(purify.sanitize(rendered));
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };

  useEffect(() => {
    if (!isExpanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsExpanded(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isExpanded]);

  // After the overlay paints at scale=1, measure the SVG's actual rendered size and
  // compute the fit scale. Using getBoundingClientRect avoids viewBox parsing and
  // correctly accounts for mermaid's own max-width constraints.
  useEffect(() => {
    if (!isExpanded || overlayReady) return;
    const frame = requestAnimationFrame(() => {
      const svgEl = svgContainerRef.current?.querySelector('svg');
      if (!svgEl) { setOverlayReady(true); return; }
      const { width, height } = svgEl.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setScale(Math.min(
          (window.innerWidth * 0.9) / width,
          (window.innerHeight * 0.85) / height,
        ));
      }
      setOverlayReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [isExpanded, overlayReady]);

  function open() {
    if (!svg) return;
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setOverlayReady(false);
    setIsExpanded(true);
  }

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragOrigin.current = { mouseX: e.clientX, mouseY: e.clientY, tx: translate.x, ty: translate.y };
    setIsDragging(true);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragOrigin.current) return;
    const { mouseX, mouseY, tx, ty } = dragOrigin.current;
    setTranslate({ x: tx + e.clientX - mouseX, y: ty + e.clientY - mouseY });
  }

  function handleMouseUp() {
    dragOrigin.current = null;
    setIsDragging(false);
  }

  function zoom(factor: number) {
    setScale(s => Math.min(SCALE_MAX, Math.max(SCALE_MIN, s * factor)));
  }

  if (error) {
    return <pre><code>{source}</code></pre>;
  }

  if (!svg) return null;

  return (
    <>
      <button
        type="button"
        title="Click to expand"
        aria-label="Expand diagram"
        onClick={open}
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      {isExpanded && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center overflow-hidden select-none"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded diagram"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={() => setIsExpanded(false)}
        >
          <div
            ref={svgContainerRef}
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transformOrigin: 'center',
              // Hidden at scale=1 until fit scale is measured, avoiding a one-frame flash.
              opacity: overlayReady ? 1 : 0,
            }}
            onClick={e => e.stopPropagation()}
            dangerouslySetInnerHTML={{ __html: svg }}
          />

          {/* Close */}
          <button
            type="button"
            className="absolute top-3 right-3 w-8 h-8 rounded bg-surface-2/80 hover:bg-surface-2 active:scale-90 text-text-primary flex items-center justify-center transition-all"
            aria-label="Close diagram"
            title="Close"
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setIsExpanded(false)}
          >
            <CloseIcon className="w-4 h-4" />
          </button>

          {/* Zoom controls */}
          <div
            className="absolute bottom-4 right-4 flex gap-1"
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="w-8 h-8 rounded bg-surface-2/80 hover:bg-surface-2 active:scale-90 text-text-primary text-lg leading-none flex items-center justify-center transition-all"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => zoom(SCALE_STEP)}
            >+</button>
            <button
              type="button"
              className="w-8 h-8 rounded bg-surface-2/80 hover:bg-surface-2 active:scale-90 text-text-primary text-lg leading-none flex items-center justify-center transition-all"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => zoom(1 / SCALE_STEP)}
            >-</button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
