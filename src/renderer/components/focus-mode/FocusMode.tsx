import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { Markdown } from 'markdown-to-jsx';
import { useShallow } from 'zustand/react/shallow';
import { useFocusModeStore } from '../../stores/focusModeStore';
import {
  addSoftBreaks,
  createFocusMarkdownOptions,
  extractHeadings,
  transformPlanRefs,
  type DocHeading,
} from '../../utils/markdown';
import { generateThemeVariables, getThemeById } from '../../themes';
import { Z_INDEX } from '../../constants/zIndex';
import { ChevronRightIcon, CloseIcon, ListIcon, MessageCircleIcon, MoonIcon, SearchIcon, SunIcon } from '../icons';
import { useReadingProgress } from './useReadingProgress';
import { FocusChatPanel } from './FocusChatPanel';

const SEARCH_MATCH_SELECTOR = '[data-search-match]';
const CURRENT_SEARCH_MATCH_SELECTOR = '[data-current="true"]';

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

export function FocusMode() {
  const { isOpen, docPath, docTitle, docContent, chatSessionId, readingTheme, close, toggleReadingTheme } = useFocusModeStore(
    useShallow((s) => ({
      isOpen: s.isOpen,
      docPath: s.docPath,
      docTitle: s.docTitle,
      docContent: s.docContent,
      chatSessionId: s.chatSessionId,
      readingTheme: s.readingTheme,
      close: s.close,
      toggleReadingTheme: s.toggleReadingTheme,
    }))
  );

  // Scope a light (fog) or dark (graphite) palette to the reader only, via CSS
  // custom properties — independent of the app theme. Reuses tested palettes.
  const themeVars = useMemo(() => {
    const theme = getThemeById(readingTheme === 'light' ? 'fog' : 'graphite');
    return theme ? generateThemeVariables(theme.colors) : {};
  }, [readingTheme]);

  const scrollRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const restoreKeyRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [isContentsOpen, setIsContentsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const headings = useMemo(() => extractHeadings(docContent), [docContent]);
  const { activeId, progress } = useReadingProgress(scrollRef, headings, docContent);
  activeIdRef.current = activeId;

  const rendered = useMemo(
    () => (
      <Markdown
        options={createFocusMarkdownOptions({
          searchQuery: showSearch ? searchQuery : '',
          currentMatchIndex,
        })}
      >
        {addSoftBreaks(transformPlanRefs(docContent))}
      </Markdown>
    ),
    [docContent, showSearch, searchQuery, currentMatchIndex]
  );

  const scrollToId = useCallback((id: string) => {
    const target = scrollRef.current?.querySelector(`#${CSS.escape(id)}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleHeadingJump = useCallback(
    (id: string) => {
      scrollToId(id);
      setIsContentsOpen(false);
    },
    [scrollToId]
  );

  const jumpHeading = useCallback(
    (dir: 1 | -1) => {
      if (headings.length === 0) return;
      const idx = activeId ? headings.findIndex((h) => h.id === activeId) : -1;
      const next = Math.min(headings.length - 1, Math.max(0, idx + dir));
      scrollToId(headings[next].id);
    },
    [headings, activeId, scrollToId]
  );

  useEffect(() => {
    if (isOpen) scrollRef.current?.focus();
  }, [isOpen]);

  const openSearch = useCallback(() => {
    setIsContentsOpen(false);
    setShowSearch(true);
  }, []);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setCurrentMatchIndex(0);
    setTotalMatches(0);
  }, []);

  const goToNextMatch = useCallback(() => {
    setCurrentMatchIndex((idx) => (totalMatches === 0 ? 0 : (idx + 1) % totalMatches));
  }, [totalMatches]);

  const goToPrevMatch = useCallback(() => {
    setCurrentMatchIndex((idx) => (totalMatches === 0 ? 0 : (idx - 1 + totalMatches) % totalMatches));
  }, [totalMatches]);

  const saveCurrentReadingPosition = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !docPath) return;
    useFocusModeStore.getState().saveReadingPosition(docPath, {
      scrollTop: el.scrollTop,
      activeId: activeIdRef.current,
    });
  }, [docPath]);

  useEffect(() => {
    if (!isOpen) {
      closeSearch();
      setIsContentsOpen(false);
      setIsChatOpen(false);
      restoreKeyRef.current = null;
    }
  }, [isOpen, closeSearch]);

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (!showSearch && searchQuery === '') return;
    const el = scrollRef.current;
    const count = showSearch && searchQuery.trim() ? el?.querySelectorAll(SEARCH_MATCH_SELECTOR).length ?? 0 : 0;
    setTotalMatches((current) => (current === count ? current : count));
    setCurrentMatchIndex((idx) => (count === 0 ? 0 : Math.min(idx, count - 1)));
  }, [showSearch, searchQuery, currentMatchIndex, docContent]);

  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  }, [showSearch]);

  useEffect(() => {
    if (!showSearch || !searchQuery.trim() || totalMatches === 0) return;
    const timeout = window.setTimeout(() => {
      const current = scrollRef.current?.querySelector<HTMLElement>(CURRENT_SEARCH_MATCH_SELECTOR);
      current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    return () => window.clearTimeout(timeout);
  }, [showSearch, searchQuery, currentMatchIndex, totalMatches]);

  useEffect(() => {
    if (!isOpen || !docPath) return;
    const el = scrollRef.current;
    if (!el) return;

    const restoreKey = `${docPath}:${docContent.length}`;
    if (restoreKeyRef.current === restoreKey) return;
    restoreKeyRef.current = restoreKey;

    const position = useFocusModeStore.getState().getReadingPosition(docPath);
    if (!position) return;

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const max = Math.max(0, el.scrollHeight - el.clientHeight);
        el.scrollTop = Math.min(position.scrollTop, max);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [isOpen, docPath, docContent.length]);

  useEffect(() => {
    if (!isOpen || !docPath) return;
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(saveCurrentReadingPosition, 200);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      saveCurrentReadingPosition();
    };
  }, [isOpen, docPath, saveCurrentReadingPosition]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        openSearch();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showSearch) {
          closeSearch();
          return;
        }
        if (isContentsOpen) {
          setIsContentsOpen(false);
          return;
        }
        if (isChatOpen) {
          setIsChatOpen(false);
          return;
        }
        close();
        return;
      }
      if (!isEditableElement(e.target) && (e.key === '[' || e.key === ']')) {
        e.preventDefault();
        jumpHeading(e.key === ']' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close, closeSearch, isChatOpen, isContentsOpen, jumpHeading, openSearch, showSearch]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 flex flex-col bg-surface-0 text-text-primary"
          style={{ ...themeVars, colorScheme: readingTheme, zIndex: Z_INDEX.modal }}
          role="dialog"
          aria-modal="true"
          aria-label={docTitle || 'Document reader'}
        >
          <ProgressBar progress={progress} />

          <header
            className="drag-region flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle pr-4"
            style={{ paddingLeft: 'var(--traffic-light-inset)' }}
          >
            <div className="min-w-0 flex-1">
              <HeadingTrail
                headings={headings}
                activeId={activeId}
                fallback={docTitle || docPath || 'Document'}
                onJump={handleHeadingJump}
              />
            </div>
            {headings.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  closeSearch();
                  setIsContentsOpen((current) => !current);
                }}
                aria-label="Open contents"
                title="Contents"
                className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors xl:hidden"
              >
                <ListIcon className="w-5 h-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                closeSearch();
                setIsChatOpen((current) => !current);
              }}
              aria-label={isChatOpen ? 'Close chat' : 'Open chat'}
              title={isChatOpen ? 'Close chat' : 'Chat'}
              className={`p-1.5 rounded transition-colors ${
                isChatOpen
                  ? 'bg-accent-subtle text-accent'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-3'
              }`}
            >
              <MessageCircleIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={openSearch}
              aria-label="Search document"
              title="Search"
              className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
            >
              <SearchIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={toggleReadingTheme}
              aria-label={readingTheme === 'dark' ? 'Switch to light' : 'Switch to dark'}
              title={readingTheme === 'dark' ? 'Light reading' : 'Dark reading'}
              className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
            >
              {readingTheme === 'dark' ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Exit reader"
              title="Exit reader"
              className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </header>

          <CompactContentsPopover
            isOpen={isContentsOpen}
            headings={headings}
            activeId={activeId}
            onJump={handleHeadingJump}
            onClose={() => setIsContentsOpen(false)}
          />

          <ReaderSearchBar
            isOpen={showSearch}
            inputRef={searchInputRef}
            query={searchQuery}
            currentMatchIndex={currentMatchIndex}
            totalMatches={totalMatches}
            onQueryChange={setSearchQuery}
            onNext={goToNextMatch}
            onPrev={goToPrevMatch}
            onClose={closeSearch}
          />

          <div className="relative flex min-h-0 flex-1">
            <OutlineRail headings={headings} activeId={activeId} onJump={handleHeadingJump} />
            <main ref={scrollRef} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
              <div className="mx-auto max-w-[72ch] px-6 py-12 sm:px-10 sm:py-14">
                <article className="prose-document">{rendered}</article>
              </div>
            </main>
            <FocusChatPanel
              isOpen={isChatOpen}
              sessionId={chatSessionId}
              docPath={docPath}
              docTitle={docTitle}
              docContent={docContent}
              onClose={() => setIsChatOpen(false)}
            />
          </div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="absolute top-0 left-0 right-0 h-0.5 bg-transparent" aria-hidden="true">
      <div
        className="h-full bg-accent transition-[width] duration-150 ease-out"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>
  );
}

function ReaderSearchBar({
  isOpen,
  inputRef,
  query,
  currentMatchIndex,
  totalMatches,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
}: {
  isOpen: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  currentMatchIndex: number;
  totalMatches: number;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.15 }}
          className="shrink-0 overflow-hidden border-b border-border-subtle bg-surface-1"
        >
          <div className="mx-auto flex max-w-[72ch] items-center gap-2 px-4 py-2 sm:px-6">
            <SearchIcon className="h-4 w-4 shrink-0 text-text-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) onPrev();
                  else onNext();
                }
              }}
              placeholder="Search document"
              className="min-w-0 flex-1 rounded-md border border-border-subtle bg-surface-0 px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
            {query && (
              <span className="whitespace-nowrap text-xs text-text-muted">
                {totalMatches === 0 ? 'No matches' : `${currentMatchIndex + 1} of ${totalMatches}`}
              </span>
            )}
            <button
              type="button"
              onClick={onPrev}
              disabled={totalMatches === 0}
              className="rounded p-1.5 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
              title="Previous match"
              aria-label="Previous match"
            >
              <ChevronRightIcon className="h-4 w-4 -rotate-90" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={totalMatches === 0}
              className="rounded p-1.5 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
              title="Next match"
              aria-label="Next match"
            >
              <ChevronRightIcon className="h-4 w-4 rotate-90" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary"
              title="Close search"
              aria-label="Close search"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

function CompactContentsPopover({
  isOpen,
  headings,
  activeId,
  onJump,
  onClose,
}: {
  isOpen: boolean;
  headings: DocHeading[];
  activeId: string | null;
  onJump: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && headings.length > 0 && (
        <>
          <m.div
            key="contents-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="absolute inset-x-0 bottom-0 top-12 xl:hidden"
            style={{ zIndex: Z_INDEX.modal + 1 }}
            onClick={onClose}
          />
          <m.nav
            key="contents-popover"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            aria-label="On this page"
            className="absolute left-3 right-3 top-14 max-h-[min(70vh,520px)] overflow-y-auto rounded-lg border border-border-default bg-surface-elevated py-3 shadow-xl xl:hidden"
            style={{ zIndex: Z_INDEX.modal + 2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 pb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted/70">
              On this page
            </div>
            <div className="space-y-0.5">
              {headings.map((heading, index) => (
                <button
                  key={`${heading.id}-${index}`}
                  type="button"
                  onClick={() => onJump(heading.id)}
                  className={`block w-full truncate border-l-2 py-1.5 pr-3 text-left text-sm transition-colors ${
                    heading.id === activeId
                      ? 'border-accent bg-surface-2 text-text-primary'
                      : 'border-transparent text-text-muted hover:bg-surface-2 hover:text-text-secondary'
                  }`}
                  style={{ paddingLeft: `${12 + (heading.level - 1) * 14}px` }}
                >
                  {heading.text}
                </button>
              ))}
            </div>
          </m.nav>
        </>
      )}
    </AnimatePresence>
  );
}

function headingPath(headings: DocHeading[], activeId: string | null): DocHeading[] {
  const idx = activeId ? headings.findIndex((h) => h.id === activeId) : -1;
  if (idx < 0) return [];

  const path: DocHeading[] = [];
  let level = Infinity;
  for (let i = idx; i >= 0; i--) {
    if (headings[i].level < level) {
      path.unshift(headings[i]);
      level = headings[i].level;
    }
  }
  return path;
}

function HeadingTrail({
  headings,
  activeId,
  fallback,
  onJump,
}: {
  headings: DocHeading[];
  activeId: string | null;
  fallback: string;
  onJump: (id: string) => void;
}) {
  const path = headingPath(headings, activeId);

  if (path.length === 0) {
    return <span className="block truncate text-xs text-text-muted">{fallback}</span>;
  }

  return (
    <nav className="flex min-w-0 items-center gap-1 text-xs text-text-muted" aria-label="Current section">
      {path.map((h, i) => (
        <Fragment key={h.id}>
          {i > 0 && <ChevronRightIcon className="h-3 w-3 shrink-0 opacity-60" />}
          <button
            type="button"
            onClick={() => onJump(h.id)}
            className={`truncate hover:text-text-primary transition-colors ${
              i === path.length - 1 ? 'text-text-secondary' : ''
            }`}
          >
            {h.text}
          </button>
        </Fragment>
      ))}
    </nav>
  );
}

function OutlineRail({
  headings,
  activeId,
  onJump,
}: {
  headings: DocHeading[];
  activeId: string | null;
  onJump: (id: string) => void;
}) {
  if (headings.length === 0) return null;

  return (
    <nav
      aria-label="On this page"
      className="group/outline hidden w-64 shrink-0 flex-col overflow-y-auto pt-14 pb-10 pl-8 pr-4 xl:flex"
    >
      <div className="mb-3 pl-3 text-[10px] font-medium uppercase tracking-wider text-text-muted/70">
        On this page
      </div>
      <div className="border-l border-border-subtle">
        {headings.map((heading, index) => (
          <button
            key={`${heading.id}-${index}`}
            type="button"
            onClick={() => onJump(heading.id)}
            className={`-ml-px block w-full truncate border-l-2 py-1 pr-2 text-left text-[13px] leading-snug transition-colors ${
              heading.id === activeId
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-muted/60 hover:text-text-secondary group-hover/outline:text-text-muted'
            }`}
            style={{ paddingLeft: `${12 + (heading.level - 1) * 12}px` }}
          >
            {heading.text}
          </button>
        ))}
      </div>
    </nav>
  );
}
