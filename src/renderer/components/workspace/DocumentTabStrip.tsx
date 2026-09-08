import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkspaceStore, isDocumentDirty } from '../../stores/workspaceStore';
import { CloseIcon } from '../icons';
import { Tooltip } from '../ui/Tooltip';
import { buildTabLabels } from './documentTabLabels';

/** Width of the fade that stands in for a scrollbar the strip deliberately hides. */
const EDGE_FADE = '20px';

/**
 * The open documents, in the order they were opened. Mirrors the chat session
 * strip so the two rows of tabs in the app read as the same control.
 */
export function DocumentTabStrip() {
  // A selector cannot build this list: a fresh array of fresh objects never
  // compares equal, not even under useShallow, and React would re-render
  // forever. So subscribe to a primitive that changes exactly when the strip
  // does, and rebuild the list off it.
  const signature = useWorkspaceStore((state) =>
    state.openDocuments
      .map((document) => `${document.id}${isDocumentDirty(document) ? '*' : ''}`)
      .join('\u0000')
  );
  const activeDocumentId = useWorkspaceStore((state) => state.activeDocumentId);
  const { setActiveDocument, closeDocument } = useWorkspaceStore(
    useShallow((state) => ({
      setActiveDocument: state.setActiveDocument,
      closeDocument: state.closeDocument,
    }))
  );

  const documents = useMemo(
    () =>
      useWorkspaceStore.getState().openDocuments.map((document) => ({
        id: document.id,
        path: document.path,
        dirty: isDocumentDirty(document),
      })),
    [signature]
  );

  const labels = useMemo(() => buildTabLabels(documents), [documents]);

  const stripRef = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState({ start: false, end: false });

  // The strip hides its scrollbar, so without a fade an off-screen document is
  // simply invisible — and arrow keys can reach one.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const measure = () => {
      const overflowing = strip.scrollWidth - strip.clientWidth > 1;
      setClipped({
        start: overflowing && strip.scrollLeft > 1,
        end: overflowing && strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    strip.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      strip.removeEventListener('scroll', measure);
    };
  }, [documents.length]);

  if (documents.length === 0) return null;

  const fadeMask = clipped.start || clipped.end
    ? `linear-gradient(to right, transparent 0, #000 ${clipped.start ? EDGE_FADE : '0px'}, ` +
      `#000 calc(100% - ${clipped.end ? EDGE_FADE : '0px'}), transparent 100%)`
    : undefined;

  const ids = documents.map((document) => document.id);

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label="Open documents"
      className="flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none
                 px-2 py-1 bg-surface-1 border-b border-border-subtle"
      style={{ maskImage: fadeMask, WebkitMaskImage: fadeMask }}
    >
      {documents.map((document, index) => (
        <DocumentTab
          key={document.id}
          id={document.id}
          path={document.path}
          label={labels.get(document.id) ?? document.path}
          dirty={document.dirty}
          isActive={document.id === activeDocumentId}
          siblingIds={ids}
          index={index}
          onActivate={setActiveDocument}
          onClose={closeDocument}
        />
      ))}
    </div>
  );
}

function DocumentTab({
  id,
  path,
  label,
  dirty,
  isActive,
  siblingIds,
  index,
  onActivate,
  onClose,
}: {
  id: string;
  path: string;
  label: string;
  dirty: boolean;
  isActive: boolean;
  siblingIds: string[];
  index: number;
  onActivate: (id: string) => void;
  onClose: (id: string) => Promise<void>;
}) {
  const tabRef = useRef<HTMLDivElement>(null);

  // Activating a tab that sits past the fade has to bring it back into view;
  // arrow keys walk the whole strip, not just the visible part.
  useEffect(() => {
    if (isActive) {
      tabRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [isActive]);

  // Arrow keys move between tabs and Delete closes one, so a keyboard user
  // never has to reach a small target with the mouse. Only the active tab is a
  // tab stop, per the standard tablist pattern.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step !== 0) {
      e.preventDefault();
      const next = siblingIds[(index + step + siblingIds.length) % siblingIds.length];
      if (next) onActivate(next);
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const target = e.key === 'Home' ? siblingIds[0] : siblingIds[siblingIds.length - 1];
      if (target) onActivate(target);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      void onClose(id);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate(id);
    }
  };

  return (
    <div
      ref={tabRef}
      role="tab"
      tabIndex={isActive ? 0 : -1}
      aria-selected={isActive}
      aria-label={dirty ? `${path}, unsaved` : path}
      onClick={() => onActivate(id)}
      onKeyDown={handleKeyDown}
      className={`
        group flex h-7 items-center gap-1.5 pl-2 pr-1 rounded-sm text-xs cursor-pointer
        transition-colors duration-150 min-w-[96px] max-w-[240px]
        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent
        ${isActive
          ? 'bg-surface-selected text-text-primary font-medium'
          : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2'
        }
      `}
    >
      {/* The label is shortened to whatever tells this tab apart from its
          siblings, so the full path has to stay one hover away. */}
      <Tooltip content={path} side="bottom">
        <span className="flex-1 min-w-0 truncate">{label}</span>
      </Tooltip>

      {/* Fixed box so the tab does not shift when a write lands. The dot and the
          close button share it: a resting tab shows whether it is written, and
          the pointer arriving swaps in the way to close it. Autosave makes the
          dot brief, which is why it is the quieter of the two. */}
      <span className="flex w-4 h-4 items-center justify-center flex-shrink-0">
        {dirty && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-warning group-hover:hidden"
            aria-hidden="true"
          />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); void onClose(id); }}
          tabIndex={-1}
          className={`
            p-0.5 rounded-sm transition-opacity duration-150
            text-text-muted hover:text-danger group-hover:opacity-100
            ${dirty ? 'hidden group-hover:block' : isActive ? 'opacity-100' : 'opacity-0'}
          `}
          aria-label={`Close ${path}`}
        >
          <CloseIcon className="w-3 h-3" />
        </button>
      </span>
    </div>
  );
}
