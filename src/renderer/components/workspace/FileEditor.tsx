
interface FileEditorProps {
  source: string;
  path: string;
  onClose: () => void;
}

/**
 * File editor wrapper for the workspace view.
 * - Markdown files: Full MarkdownEditor with toolbar, shortcuts, side-by-side preview
 */
  const hasUnsavedChanges = useHasUnsavedChanges();
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

  // Auto-save with debounce
  useEffect(() => {
    if (!editingFile || editingFile.isReadOnly) return;
    if (editingFile.content === editingFile.originalContent) {
      setSaveStatus('saved');
      return;
    }

    setSaveStatus('unsaved');
      setSaveStatus('saving');
    }, 1000);

    return () => clearTimeout(timer);
  }, [editingFile?.content, editingFile?.originalContent, editingFile?.isReadOnly, saveFile]);

  if (!editingFile) {
    return null;
  }

  const isMarkdown = editingFile.path.toLowerCase().endsWith('.md');

  // Handle content change
  const handleContentChange = useCallback((newContent: string) => {
    updateContent(newContent);
  }, [updateContent]);

  // Handle close with unsaved changes check
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
    }
    onClose();
  }, [hasUnsavedChanges, onClose]);

  // Get file type icon
  const FileTypeIcon = () => {
    if (isMarkdown) {
      return (
        <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    );
  };

  // For markdown files, use the full-featured MarkdownEditor
  if (isMarkdown && !editingFile.isReadOnly) {
    return (
      <div className="flex flex-col h-full bg-surface-1">
        {/* Header */}
            <FileTypeIcon />
              {filename}
            </span>
              <div
                className={`
                  w-1.5 h-1.5 rounded-full transition-colors duration-200
                  ${saveStatus === 'saved' ? 'bg-success' : ''}
                  ${saveStatus === 'unsaved' ? 'bg-warning' : ''}
                  ${saveStatus === 'saving' ? 'bg-accent animate-pulse' : ''}
                `}
              />
              <span className={`text-xs transition-colors ${saveStatus === 'unsaved' ? 'text-warning' : 'text-text-muted'}`}>
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'unsaved' ? 'Unsaved' : 'Saved'}
              </span>
            </div>
          </div>
        </div>

        {/* Error display */}
        {saveError && (
          <div className="px-4 py-2.5 bg-danger/10 flex items-center gap-2">
            <svg className="w-4 h-4 text-danger flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-xs text-danger">{saveError}</p>
          </div>
        )}

        {/* MarkdownEditor takes the rest */}
        <div className="flex-1 overflow-hidden">
          <MarkdownEditor
            content={editingFile.content}
            onChange={handleContentChange}
          />
        </div>
      </div>
    );
  }

  // For non-markdown files, use the simpler layout
  return (
    <div className="flex flex-col h-full bg-surface-1">
      {/* Header */}
          <FileTypeIcon />
            {filename}
          </span>

          {editingFile.isReadOnly && (
              Read-only
            </span>
          )}

          {!editingFile.isReadOnly && (
            <div className="flex items-center gap-1.5">
              <div
                className={`
                  w-1.5 h-1.5 rounded-full transition-colors duration-200
                  ${saveStatus === 'saved' ? 'bg-success' : ''}
                  ${saveStatus === 'unsaved' ? 'bg-warning' : ''}
                  ${saveStatus === 'saving' ? 'bg-accent animate-pulse' : ''}
                `}
              />
              <span className={`text-xs transition-colors ${saveStatus === 'unsaved' ? 'text-warning' : 'text-text-muted'}`}>
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'unsaved' ? 'Unsaved' : 'Saved'}
              </span>
            </div>
          )}
        </div>

      </div>

      <div className="divider mx-4" />

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {editingFile.isReadOnly ? (
        ) : (
            content={editingFile.content}
            onChange={handleContentChange}
          />
        )}
      </div>

      {/* Error display */}
      {saveError && (
        <div className="px-4 py-2.5 bg-danger/10 flex items-center gap-2">
          <svg className="w-4 h-4 text-danger flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-xs text-danger">{saveError}</p>
        </div>
      )}
    </div>
  );
});
