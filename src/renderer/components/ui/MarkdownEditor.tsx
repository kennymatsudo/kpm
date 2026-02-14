/**
 *
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

export interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
}

interface ToolbarButtonProps {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

  return (
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-border-default mx-1" />;
}

type FormatAction =
  | { type: 'wrap'; before: string; after: string }
  | { type: 'prefix'; prefix: string }
  | { type: 'block'; before: string; after: string }
  | { type: 'link' };

export function MarkdownEditor({
  content,
  onChange,
}: MarkdownEditorProps) {
  const [localContent, setLocalContent] = useState(content);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('preview');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [searchNavigationTick, setSearchNavigationTick] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const focusSearchInput = useCallback(() => {
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  useEffect(() => {
    }
  }, [content]);

      setLocalContent(newContent);
      onChange(newContent);
    },
  );

  const applyFormat = useCallback((action: FormatAction) => {

      setActiveTab('edit');
    }


    }


  const formatBold = useCallback(() => applyFormat({ type: 'wrap', before: '**', after: '**' }), [applyFormat]);
  const formatItalic = useCallback(() => applyFormat({ type: 'wrap', before: '_', after: '_' }), [applyFormat]);
  const formatCode = useCallback(() => applyFormat({ type: 'wrap', before: '`', after: '`' }), [applyFormat]);
  const formatCodeBlock = useCallback(() => applyFormat({ type: 'block', before: '```', after: '```' }), [applyFormat]);
  const formatH1 = useCallback(() => applyFormat({ type: 'prefix', prefix: '# ' }), [applyFormat]);
  const formatH2 = useCallback(() => applyFormat({ type: 'prefix', prefix: '## ' }), [applyFormat]);
  const formatH3 = useCallback(() => applyFormat({ type: 'prefix', prefix: '### ' }), [applyFormat]);
  const formatBulletList = useCallback(() => applyFormat({ type: 'prefix', prefix: '- ' }), [applyFormat]);
  const formatNumberedList = useCallback(() => applyFormat({ type: 'prefix', prefix: '1. ' }), [applyFormat]);
  const formatQuote = useCallback(() => applyFormat({ type: 'prefix', prefix: '> ' }), [applyFormat]);
  const formatLink = useCallback(() => applyFormat({ type: 'link' }), [applyFormat]);

  const matchIndexes = useMemo(() => {
    if (!showSearch || !searchQuery) return [];

    const results: number[] = [];
    const lowerQuery = searchQuery.toLowerCase();
    let index = lowerContent.indexOf(lowerQuery);

    while (index !== -1) {
      results.push(index);
      index = lowerContent.indexOf(lowerQuery, index + 1);
    }

    return results;

  const totalMatches = matchIndexes.length;

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setCurrentMatchIndex(0);
    setSearchNavigationTick(0);
  }, []);

  const openSearch = useCallback(() => {
    setShowSearch(true);
    focusSearchInput();
  }, [focusSearchInput]);


  const goToNextMatch = useCallback(() => {
    if (totalMatches === 0) return;
    const nextIndex = (currentMatchIndex + 1) % totalMatches;
    setCurrentMatchIndex(nextIndex);
    setSearchNavigationTick((prev) => prev + 1);

  const goToPrevMatch = useCallback(() => {
    if (totalMatches === 0) return;
    const prevIndex = (currentMatchIndex - 1 + totalMatches) % totalMatches;
    setCurrentMatchIndex(prevIndex);
    setSearchNavigationTick((prev) => prev + 1);

  }, [showSearch, searchQuery, currentMatchIndex]);

  useEffect(() => {
    if (currentMatchIndex >= totalMatches) {
      setCurrentMatchIndex(Math.max(0, totalMatches - 1));
    }
  }, [currentMatchIndex, totalMatches]);

  useEffect(() => {
    if (!showSearch) return;
    focusSearchInput();
  }, [showSearch, focusSearchInput]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showSearch) {
        e.preventDefault();
        closeSearch();
        return;
      }

        e.preventDefault();
        openSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);

  useEffect(() => {

  useEffect(() => {
    if (activeTab !== 'preview' || !showSearch || !searchQuery || totalMatches === 0) return;

    const timeoutId = setTimeout(() => {
      const container = previewRef.current;
      if (!container) return;
      const allMatches = Array.from(container.querySelectorAll<HTMLElement>('mark[data-search-match]'));
      const targetMatch =
        allMatches[currentMatchIndex] ??
        container.querySelector<HTMLElement>(`[data-search-match="${currentMatchIndex}"]`) ??
        container.querySelector<HTMLElement>('[data-current="true"]') ??
        allMatches[0];
      if (targetMatch) {
        targetMatch.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [activeTab, showSearch, searchQuery, totalMatches, currentMatchIndex, searchNavigationTick]);

  return (
    <div className="flex flex-col h-full bg-surface-0">
      {/* Toolbar with Edit/Preview toggle */}
          <button
            onClick={() => setActiveTab('edit')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all
              ${activeTab === 'edit'
                ? 'bg-surface-3 text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-2'
              }`}
          >
            Edit
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all
              ${activeTab === 'preview'
                ? 'bg-surface-3 text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-2'
              }`}
          >
            Preview
          </button>
        </div>

        <ToolbarDivider />

              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6V4zm0 8h9a4 4 0 014 4 4 4 0 01-4 4H6v-8z" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            </ToolbarButton>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="19" y1="4" x2="10" y2="4" />
                <line x1="14" y1="20" x2="5" y2="20" />
                <line x1="15" y1="4" x2="9" y2="20" />
              </svg>
            </ToolbarButton>

            <ToolbarDivider />

              <span className="font-bold text-xs">H1</span>
            </ToolbarButton>
              <span className="font-bold text-xs">H2</span>
            </ToolbarButton>
              <span className="font-bold text-xs">H3</span>
            </ToolbarButton>

            <ToolbarDivider />

              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </ToolbarButton>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <polyline points="9 9 6 12 9 15" />
                <polyline points="15 9 18 12 15 15" />
              </svg>
            </ToolbarButton>

            <ToolbarDivider />

              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <circle cx="4" cy="6" r="1" fill="currentColor" />
                <circle cx="4" cy="12" r="1" fill="currentColor" />
                <circle cx="4" cy="18" r="1" fill="currentColor" />
              </svg>
            </ToolbarButton>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="10" y1="6" x2="21" y2="6" />
                <line x1="10" y1="12" x2="21" y2="12" />
                <line x1="10" y1="18" x2="21" y2="18" />
                <text x="3" y="8" fontSize="6" fill="currentColor" stroke="none">1</text>
                <text x="3" y="14" fontSize="6" fill="currentColor" stroke="none">2</text>
                <text x="3" y="20" fontSize="6" fill="currentColor" stroke="none">3</text>
              </svg>
            </ToolbarButton>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
                <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
              </svg>
            </ToolbarButton>

            <ToolbarDivider />

              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
              </svg>
            </ToolbarButton>
          </div>

      </div>

        <div className="px-4 py-2 bg-surface-2 border-b border-border-default">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>

            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentMatchIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) {
                    goToPrevMatch();
                  } else {
                    goToNextMatch();
                  }
                }
              }}
              placeholder="Search in document..."
              className="flex-1 bg-surface-1 border border-border-subtle rounded-md px-3 py-1.5 text-sm
                         text-text-primary placeholder-text-muted
                         focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/30"
            />

            {searchQuery && (
              <span className="text-xs text-text-muted whitespace-nowrap">
                {totalMatches === 0 ? 'No matches' : `${currentMatchIndex + 1} of ${totalMatches}`}
              </span>
            )}

            <div className="flex items-center gap-0.5">
              <button
                type="button"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                </svg>
              </button>
          </div>
        </div>
      )}

            value={localContent}
          />
                  </div>
            </div>
          </div>
      </div>
    </div>
  );
}
