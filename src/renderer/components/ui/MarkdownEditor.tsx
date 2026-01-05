/**
 *
 */


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

            value={localContent}
          />
                  </div>
            </div>
          </div>
      </div>
    </div>
  );
}
