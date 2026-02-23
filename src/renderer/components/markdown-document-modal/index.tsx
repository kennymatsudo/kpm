import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { Markdown } from 'markdown-to-jsx';
import { MotionButton } from '../ui/MotionButton';
import { DiffViewer, computeDiff, getDiffStatsFromDiff } from '../ui/DiffViewer';
import { Z_INDEX } from '../../constants/zIndex';
import { useMarkdownSearch, useMarkdownFormatting, useMarkdownKeyboard } from './hooks';

// Toolbar button component
interface ToolbarButtonProps {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

function ToolbarButton({ onClick, title, children, className = '' }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-1
                  transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-border-default mx-1" />;
}

// Icons for toolbar
const BoldIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6V4zm0 8h9a4 4 0 014 4 4 4 0 01-4 4H6v-8z" stroke="currentColor" strokeWidth="2" fill="none" />
  </svg>
);

const ItalicIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="19" y1="4" x2="10" y2="4" />
    <line x1="14" y1="20" x2="5" y2="20" />
    <line x1="15" y1="4" x2="9" y2="20" />
  </svg>
);

const StrikethroughIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.5 12h-11M6 16.5c0 1.5 1.5 3 4.5 3 4 0 5-2 5-3.5 0-2-1.5-3-5-3" />
    <path d="M8.5 8.5c0-1.5 1.5-3 4-3 3.5 0 4.5 1.5 4.5 3 0 1-0.5 1.5-1 2" />
  </svg>
);

const HeadingIcon = ({ level }: { level: 1 | 2 | 3 }) => (
  <span className="font-bold text-xs">H{level}</span>
);

const CodeIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const CodeBlockIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <polyline points="9 9 6 12 9 15" />
    <polyline points="15 9 18 12 15 15" />
  </svg>
);

const ListIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="4" cy="6" r="1" fill="currentColor" />
    <circle cx="4" cy="12" r="1" fill="currentColor" />
    <circle cx="4" cy="18" r="1" fill="currentColor" />
  </svg>
);

const NumberedListIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="10" y1="6" x2="21" y2="6" />
    <line x1="10" y1="12" x2="21" y2="12" />
    <line x1="10" y1="18" x2="21" y2="18" />
    <text x="3" y="8" fontSize="6" fill="currentColor" stroke="none">1</text>
    <text x="3" y="14" fontSize="6" fill="currentColor" stroke="none">2</text>
    <text x="3" y="20" fontSize="6" fill="currentColor" stroke="none">3</text>
  </svg>
);

const QuoteIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
  </svg>
);

const LinkIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);

const TaskListIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="5" width="4" height="4" rx="0.5" />
    <line x1="10" y1="7" x2="21" y2="7" />
    <rect x="3" y="15" width="4" height="4" rx="0.5" />
    <line x1="10" y1="17" x2="21" y2="17" />
    <path d="M4 16.5l1 1 2-2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const HorizontalRuleIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="12" x2="21" y2="12" />
  </svg>
);

type ViewMode = 'diff' | 'preview' | 'edit';

interface MarkdownDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (content: string) => void;
  onDelete?: () => void;
  isDeleting?: boolean;
  title: string;
  subtitle: string;
  content: string;
  placeholder?: string;
  icon: React.ReactNode;
  initialEditMode?: boolean;
  /** Show Accept button in preview mode (for proposed documents) */
  showAcceptButton?: boolean;
  /** Original content for diff view (null for new documents) */
  oldContent?: string | null;
}

export function MarkdownDocumentModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  isDeleting = false,
  title,
  subtitle,
  content,
  placeholder,
  icon,
  initialEditMode = false,
  showAcceptButton = false,
  oldContent,
}: MarkdownDocumentModalProps) {
  // Determine initial view mode based on oldContent
  const initialViewMode: ViewMode = oldContent !== undefined ? 'diff' : initialEditMode ? 'edit' : 'preview';
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [draft, setDraft] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Compute diff stats for display
  const diffLines = useMemo(() => {
    if (oldContent === undefined) return null;
    return computeDiff(oldContent, content);
  }, [oldContent, content]);
  const diffStats = diffLines ? getDiffStatsFromDiff(diffLines) : null;

  // Search functionality
  const {
    showSearch,
    searchQuery,
    currentMatchIndex,
    totalMatches,
    searchOptions,
    setShowSearch,
    setSearchQuery,
    closeSearch,
    goToNextMatch,
    goToPrevMatch,

  useEffect(() => {
    if (isOpen) {
      setDraft(content);
      const newViewMode: ViewMode = oldContent !== undefined ? 'diff' : initialEditMode ? 'edit' : 'preview';
      setViewMode(newViewMode);
      closeSearch();
    }

  // Formatting actions
  const {
    formatBold,
    formatItalic,
    formatStrikethrough,
    formatCode,
    formatCodeBlock,
    formatH1,
    formatH2,
    formatH3,
    formatBulletList,
    formatNumberedList,
    formatTaskList,
    formatQuote,
    formatLink,
    formatHorizontalRule,
  } = useMarkdownFormatting({ draft, setDraft, viewMode, textareaRef });

  // Keyboard shortcuts
  useMarkdownKeyboard({
    isOpen,
    viewMode,
    draft,
    showSearch,
    oldContent,
    onClose,
    onSave,
    setViewMode,
    setShowSearch,
    closeSearch,
    formatBold,
    formatItalic,
    formatLink,
  });

  const hasChanges = draft !== content;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-overlay flex items-center justify-center"
          style={{ zIndex: Z_INDEX.modal }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="dialog-content w-[900px] min-w-[500px] max-w-[92vw] h-[85vh] max-h-[900px] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
                {icon}
                </div>
              </div>
                {onDelete && (
                  <button
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="text-text-muted hover:text-danger transition-colors p-2 hover:bg-danger/10 rounded-lg
                               disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete"
                  >
                    {isDeleting ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                )}
                <MotionButton
                  onClick={onClose}
                  className="text-text-muted hover:text-text-primary transition-colors p-2 hover:bg-surface-2 rounded-lg"
                >
                  <CloseIcon className="w-5 h-5" />
                </MotionButton>
              </div>
            </div>

            {/* Tab bar */}
              {/* Diff tab - only shown if oldContent exists */}
              {oldContent !== undefined && (
                <button
                  onClick={() => setViewMode('diff')}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all ${
                    viewMode === 'diff'
                      ? 'text-text-primary bg-surface-2 shadow-sm'
                      : 'text-text-muted hover:text-text-secondary hover:bg-surface-2/50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Diff
                    {diffStats && (
                      <span className="flex items-center gap-1.5 text-xs font-semibold">
                        <span className="text-success bg-success/10 px-1.5 py-0.5 rounded">
                          +{diffStats.addedCount}
                        </span>
                        <span className="text-danger bg-danger/10 px-1.5 py-0.5 rounded">
                          −{diffStats.removedCount}
                        </span>
                      </span>
                    )}
                  </span>
                </button>
              )}

              {/* Preview tab */}
              <button
                onClick={() => setViewMode('preview')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all ${
                  viewMode === 'preview'
                    ? 'text-text-primary bg-surface-2 shadow-sm'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface-2/50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Preview
                </span>
              </button>

              {/* Edit tab */}
              <button
                onClick={() => setViewMode('edit')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all ${
                  viewMode === 'edit'
                    ? 'text-text-primary bg-surface-2 shadow-sm'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface-2/50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </span>
              </button>
            </div>

            {/* Search bar */}
            <AnimatePresence>
              {showSearch && (
                <m.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="px-6 py-2 bg-surface-2 border-b border-border-subtle overflow-hidden"
                >
                  <div className="flex items-center gap-2">
                    {/* Search icon */}
                    <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>

                    {/* Search input */}
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
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

                    {/* Match count */}
                    {searchQuery && (
                      <span className="text-xs text-text-muted whitespace-nowrap">
                        {totalMatches === 0
                          ? 'No matches'
                          : `${currentMatchIndex + 1} of ${totalMatches}`}
                      </span>
                    )}

                    {/* Navigation buttons */}
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={goToPrevMatch}
                        disabled={totalMatches === 0}
                        className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-1
                                   transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Previous match (Shift+Enter)"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={goToNextMatch}
                        disabled={totalMatches === 0}
                        className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-1
                                   transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Next match (Enter)"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {/* Close button */}
                    <button
                      onClick={closeSearch}
                      className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-1 transition-colors"
                      title="Close search (Esc)"
                    >
                      <CloseIcon className="w-4 h-4" />
                    </button>
                  </div>
                </m.div>
              )}
            </AnimatePresence>

            {/* Toolbar (only in edit mode) */}
            <AnimatePresence>
              {viewMode === 'edit' && (
                <m.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="px-6 bg-surface-2 border-b border-border-subtle overflow-hidden"
                >
                  <div className="flex items-center gap-0.5 py-2 flex-wrap">
                    {/* Text formatting */}
                    <ToolbarButton onClick={formatBold} title="Bold (⌘B)">
                      <BoldIcon />
                    </ToolbarButton>
                    <ToolbarButton onClick={formatItalic} title="Italic (⌘I)">
                      <ItalicIcon />
                    </ToolbarButton>
                    <ToolbarButton onClick={formatStrikethrough} title="Strikethrough">
                      <StrikethroughIcon />
                    </ToolbarButton>

                    <ToolbarDivider />

                    {/* Headings */}
                    <ToolbarButton onClick={formatH1} title="Heading 1">
                      <HeadingIcon level={1} />
                    </ToolbarButton>
                    <ToolbarButton onClick={formatH2} title="Heading 2">
                      <HeadingIcon level={2} />
                    </ToolbarButton>
                    <ToolbarButton onClick={formatH3} title="Heading 3">
                      <HeadingIcon level={3} />
                    </ToolbarButton>

                    <ToolbarDivider />

                    {/* Code */}
                    <ToolbarButton onClick={formatCode} title="Inline Code">
                      <CodeIcon />
                    </ToolbarButton>
                    <ToolbarButton onClick={formatCodeBlock} title="Code Block">
                      <CodeBlockIcon />
                    </ToolbarButton>

                    <ToolbarDivider />

                    {/* Lists */}
                    <ToolbarButton onClick={formatBulletList} title="Bullet List">
                      <ListIcon />
                    </ToolbarButton>
                    <ToolbarButton onClick={formatNumberedList} title="Numbered List">
                      <NumberedListIcon />
                    </ToolbarButton>
                    <ToolbarButton onClick={formatTaskList} title="Task List">
                      <TaskListIcon />
                    </ToolbarButton>

                    <ToolbarDivider />

                    {/* Other */}
                    <ToolbarButton onClick={formatQuote} title="Quote">
                      <QuoteIcon />
                    </ToolbarButton>
                    <ToolbarButton onClick={formatLink} title="Link (⌘K)">
                      <LinkIcon />
                    </ToolbarButton>
                    <ToolbarButton onClick={formatHorizontalRule} title="Horizontal Rule">
                      <HorizontalRuleIcon />
                    </ToolbarButton>
                  </div>
                </m.div>
              )}
            </AnimatePresence>

            {/* Content area */}
            <div className="flex-1 overflow-hidden bg-surface-2">
              <AnimatePresence mode="wait">
                {viewMode === 'diff' && oldContent !== undefined ? (
                  <m.div
                    key="diff"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.15 }}
                    className="h-full overflow-y-auto p-6"
                  >
                    <div className="max-w-4xl mx-auto">
                      <DiffViewer oldContent={oldContent} newContent={content} diffLines={diffLines ?? undefined} />
                    </div>
                  </m.div>
                ) : viewMode === 'edit' ? (
                  <m.div
                    key="edit"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.15 }}
                    className="h-full p-4"
                  >
                    <textarea
                      ref={textareaRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="w-full h-full p-5 text-sm font-mono leading-relaxed bg-surface-1
                                 rounded-xl border border-border-subtle
                                 text-text-primary placeholder-text-muted resize-none
                                 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/30"
                      placeholder={placeholder}
                      autoFocus
                    />
                  </m.div>
                ) : (
                  <m.div
                    key="preview"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.15 }}
                    className="h-full overflow-y-auto"
                  >
                    {draft ? (
                      <div className="p-8 max-w-3xl mx-auto">
                        <div className="prose-themed">
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-center space-y-3 p-8">
                          <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-1 flex items-center justify-center">
                            <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <p className="text-text-muted text-sm">No content yet</p>
                          <button
                            onClick={() => setViewMode('edit')}
                            className="text-accent text-sm hover:underline"
                          >
                            Start writing
                          </button>
                        </div>
                      </div>
                    )}
                  </m.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
                <span className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-xxs font-mono">⌘F</kbd>
                  <span>search</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-xxs font-mono">⌘E</kbd>
                  <span>toggle view</span>
                </span>
                {viewMode === 'edit' && (
                  <>
                    <span className="flex items-center gap-1.5">
                      <kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-xxs font-mono">⌘↵</kbd>
                      <span>save</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-xxs font-mono">⌘B</kbd>
                      <span>bold</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-xxs font-mono">⌘I</kbd>
                      <span>italic</span>
                    </span>
                  </>
                )}
              </div>
                <MotionButton
                  variant="secondary"
                  onClick={onClose}
                >
                  {viewMode === 'edit' && hasChanges ? 'Discard' : 'Close'}
                </MotionButton>
                {/* Accept button for proposals (visible in non-edit modes) */}
                {viewMode !== 'edit' && showAcceptButton && (
                  <MotionButton
                    variant="primary"
                    onClick={() => onSave(draft)}
                  >
                    Accept
                  </MotionButton>
                )}
                {/* Save button for edit mode */}
                {viewMode === 'edit' && (
                  <MotionButton
                    variant="primary"
                    onClick={() => onSave(draft)}
                    disabled={!hasChanges}
                    className="disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save Changes
                  </MotionButton>
                )}
              </div>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
