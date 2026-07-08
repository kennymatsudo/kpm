import { memo, useCallback, useEffect, useState, useMemo } from 'react';
import { useWorkspaceStore, useHasUnsavedChanges, useProjectUiDomainStore, useFocusModeStore } from '../../stores';
import { useShallow } from 'zustand/react/shallow';
import { CodeEditorLazy, MarkdownEditorLazy } from '../ui';
import { ConfirmActionDialog } from '../ui/ConfirmActionDialog';
import { BookOpenIcon } from '../icons';
import type { FocusedResource } from '../../../shared/types';
import { getBaseName } from '../../utils/path';

interface FileEditorProps {
  source: string;
  path: string;
  onClose: () => void;
}

function FileTypeIcon({ isMarkdown }: { isMarkdown: boolean }) {
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
}

/**
 * File editor wrapper for the workspace view.
 * - Markdown files: Full MarkdownEditor with toolbar, shortcuts, side-by-side preview
 * - Other files: Monaco-based editor/viewer
 */
export const FileEditor = memo(function FileEditor({ source: _source, path, onClose }: FileEditorProps) {
  const { editingFile, updateContent, saveFile, isSaving: _isSaving, saveError } = useWorkspaceStore(
    useShallow((state) => ({
      editingFile: state.editingFile,
      updateContent: state.updateContent,
      saveFile: state.saveFile,
      isSaving: state.isSaving,
      saveError: state.saveError,
    }))
  );
  const hasUnsavedChanges = useHasUnsavedChanges();
  const openFocusMode = useFocusModeStore((s) => s.open);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  // Context management for chat
  const { focusedResources, addFocusedResource, removeFocusedResource } = useProjectUiDomainStore(
    useShallow((state) => ({
      focusedResources: state.focusedResources,
      addFocusedResource: state.addFocusedResource,
      removeFocusedResource: state.removeFocusedResource,
    }))
  );

  // Check if current file is in focused resources
  const isInContext = useMemo(() => {
    return focusedResources.some(
      (r) => r.type === 'project_file' && r.path === path
    );
  }, [focusedResources, path]);

  // Toggle context for current file
  const handleToggleContext = useCallback(() => {
    const resource: FocusedResource = {
      type: 'project_file',
      path,
      isDirectory: false,
    };

    if (isInContext) {
      removeFocusedResource(resource);
    } else {
      addFocusedResource(resource);
    }
  }, [path, isInContext, addFocusedResource, removeFocusedResource]);

  // Auto-save with debounce
  useEffect(() => {
    if (!editingFile || editingFile.isReadOnly) return;
    if (editingFile.content === editingFile.originalContent) {
      setSaveStatus('saved');
      return;
    }

    setSaveStatus('unsaved');
    const timer = setTimeout(() => {
      setSaveStatus('saving');
      void saveFile().then(() => setSaveStatus('saved'));
    }, 1000);

    return () => clearTimeout(timer);
  }, [editingFile?.content, editingFile?.originalContent, editingFile?.isReadOnly, saveFile]);

  if (!editingFile) {
    return null;
  }

  const isMarkdown = editingFile.path.toLowerCase().endsWith('.md');
  const filename = getBaseName(editingFile.path, 'Untitled');

  // Handle content change
  const handleContentChange = useCallback((newContent: string) => {
    updateContent(newContent);
  }, [updateContent]);

  // Handle close with unsaved changes check
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedConfirm(true);
      return;
    }
    onClose();
  }, [hasUnsavedChanges, onClose]);

  const handleEnterFocus = useCallback(() => {
    if (!editingFile) return;
    openFocusMode({
      path: editingFile.path,
      title: filename,
      content: editingFile.content,
    });
  }, [editingFile, filename, openFocusMode]);

  const focusButton = isMarkdown ? (
    <button
      onClick={handleEnterFocus}
      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-3 text-text-muted hover:text-text-primary transition-all flex-shrink-0"
      title="Open in focus reader"
      aria-label="Open in focus reader"
    >
      <BookOpenIcon className="w-4 h-4" />
    </button>
  ) : null;

  // Confirmation shown when closing with unsaved changes. Shared across both
  // editor layouts (markdown / non-markdown).
  const unsavedConfirmDialog = showUnsavedConfirm ? (
    <ConfirmActionDialog
      title="Discard unsaved changes?"
      message="This file has unsaved changes that will be lost if you close it now."
      dialogId="file-editor-unsaved"
      cancelLabel="Keep editing"
      onCancel={() => setShowUnsavedConfirm(false)}
      action={{
        label: 'Discard changes',
        variant: 'danger',
        onClick: () => {
          setShowUnsavedConfirm(false);
          onClose();
        },
      }}
    />
  ) : null;

  // For markdown files, use the full-featured MarkdownEditor
  if (isMarkdown && !editingFile.isReadOnly) {
    return (
      <div className="flex flex-col h-full bg-surface-1">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 min-w-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <FileTypeIcon isMarkdown={isMarkdown} />
            <span className="text-sm font-medium text-text-primary truncate" title={editingFile.path}>
              {filename}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
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
          <div className="flex items-center gap-1 flex-shrink-0">
            {focusButton}
            <button
              onClick={handleClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-3 text-text-muted hover:text-text-primary transition-all"
              title="Close editor (Esc)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
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
          <MarkdownEditorLazy
            content={editingFile.content}
            onChange={handleContentChange}
          />
        </div>
        {unsavedConfirmDialog}
      </div>
    );
  }

  // For non-markdown files, use the simpler layout
  return (
    <div className="flex flex-col h-full bg-surface-1">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 min-w-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <FileTypeIcon isMarkdown={isMarkdown} />
          <span className="text-sm font-medium text-text-primary truncate" title={editingFile.path}>
            {filename}
          </span>

          {editingFile.isReadOnly && (
            <span className="px-2 py-0.5 text-xxs font-medium text-text-muted bg-surface-3 rounded-full shadow-sm">
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

        <div className="flex items-center gap-2 flex-shrink-0">
          {focusButton}
          <button
            onClick={handleToggleContext}
            className={`
              px-2 py-1 text-xs rounded-md flex items-center gap-1.5 transition-all
              ${isInContext
                ? 'bg-accent/15 text-accent hover:bg-accent/25'
                : 'bg-surface-3 text-text-muted hover:text-text-primary hover:bg-surface-4'
              }
            `}
            title={isInContext ? 'Remove from chat context' : 'Add to chat context'}
          >
            {isInContext ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
            <span>{isInContext ? 'In context' : 'Add to context'}</span>
          </button>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-3 text-text-muted hover:text-text-primary transition-all"
            title="Close editor (Esc)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="divider mx-4" />

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {editingFile.isReadOnly ? (
          <CodeEditorLazy
            path={editingFile.path}
            content={editingFile.content}
            isReadOnly
          />
        ) : (
          <CodeEditorLazy
            path={editingFile.path}
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
      {unsavedConfirmDialog}
    </div>
  );
});
