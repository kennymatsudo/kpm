import { memo, useCallback, useMemo } from 'react';
import { useProjectUiDomainStore, useProjectDomainStore, useFocusModeStore } from '../../stores';
import {
  useWorkspaceStore,
  useSaveStatus,
  type SaveStatus,
} from '../../stores/workspaceStore';
import { useShallow } from 'zustand/react/shallow';
import { CodeEditorLazy, MarkdownEditorLazy } from '../ui';
import { Tooltip } from '../ui/Tooltip';
import { BookOpenIcon, CheckIcon, CloseIcon, PlusIcon, WarningTriangleIcon } from '../icons';
import type { FocusedResource } from '../../../shared/types';
import { getBaseName } from '../../utils/path';
import { LinearPublishChip } from '../linearDocuments';

interface FileEditorProps {
  documentId: string;
  onClose: () => void;
}

/** The autosave states worth a word. A written, idle buffer is not one of them. */
type ReportableSaveState = 'saving' | 'unsaved' | 'failed';

/**
 * Autosave state, shown only when there is something to say: a write in flight,
 * an edit not yet written, or a write that failed. A permanent "Saved" occupies
 * the slot without ever reporting a change, which trains the eye to skip it.
 */
function SaveIndicator({ state }: { state: ReportableSaveState }) {
  const tone =
    state === 'saving' ? 'text-text-secondary' : state === 'failed' ? 'text-danger' : 'text-warning';
  const dot = state === 'saving' ? 'bg-accent animate-pulse' : state === 'failed' ? 'bg-danger' : 'bg-warning';
  const label = state === 'saving' ? 'Saving...' : state === 'failed' ? 'Not saved' : 'Unsaved';

  return (
    <span className={`text-tiny flex items-center gap-1.5 flex-shrink-0 ${tone}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function reportableSaveState(status: SaveStatus, hasSaveError: boolean): ReportableSaveState | null {
  if (hasSaveError) return 'failed';
  return status === 'saved' ? null : status;
}

/**
 * File editor for the workspace panel.
 *
 * Both file kinds get the same header — autosave state when there is any, then
 * the same actions in the same order — because the only thing that differs
 * is the body: markdown opens the shared MarkdownEditor (which absorbs the
 * header into its own toolbar row), everything else opens Monaco.
 */
export const FileEditor = memo(function FileEditor({ documentId, onClose }: FileEditorProps) {
  const document = useWorkspaceStore(
    (state) => state.openDocuments.find((candidate) => candidate.id === documentId) ?? null
  );
  const projectId = useProjectDomainStore((state) => state.currentProjectId);
  const updateContent = useWorkspaceStore((state) => state.updateContent);
  const saveDocument = useWorkspaceStore((state) => state.saveDocument);
  const saveStatus = useSaveStatus(documentId);
  const openFocusMode = useFocusModeStore((s) => s.open);
  const path = document?.path ?? '';

  // Context management for chat
  const { focusedResources, addFocusedResource, removeFocusedResource } = useProjectUiDomainStore(
    useShallow((state) => ({
      focusedResources: state.focusedResources,
      addFocusedResource: state.addFocusedResource,
      removeFocusedResource: state.removeFocusedResource,
    }))
  );

  const isInContext = useMemo(() => {
    return focusedResources.some(
      (r) => r.type === 'project_file' && r.path === path
    );
  }, [focusedResources, path]);

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

  // Autosave is not here any more: it belongs above the editor, where it keeps
  // running for tabs that are not on screen. See useDocumentAutosave.
  const handleContentChange = useCallback((newContent: string) => {
    updateContent(documentId, newContent);
  }, [documentId, updateContent]);

  const isMarkdown = path.toLowerCase().endsWith('.md');
  const filename = getBaseName(path, 'Untitled');

  const handleRetrySave = useCallback(() => {
    void saveDocument(documentId);
  }, [documentId, saveDocument]);

  const handleEnterFocus = useCallback(() => {
    if (!document) return;
    openFocusMode({
      path: document.path,
      title: filename,
      content: document.content,
    });
  }, [document, filename, openFocusMode]);

  if (!document) {
    return null;
  }

  // Neither the filename nor the file kind belongs here: the tab strip directly
  // above already carries both. All that is left is autosave state, and only
  // when it has something to report. The slot sits between the left-anchored
  // tabs and the right-anchored actions, so its collapsing moves nothing.
  const saveState = reportableSaveState(saveStatus, Boolean(document.saveError));
  const identity = saveState ? <SaveIndicator state={saveState} /> : undefined;

  const fileActions = (
    <>
      {projectId && isMarkdown && (
        <LinearPublishChip
          projectId={projectId}
          documentId={documentId}
          documentPath={document.path}
        />
      )}
      <Tooltip content={isInContext ? 'Remove from context' : 'Add to context'} side="bottom">
        <button
          type="button"
          onClick={handleToggleContext}
          aria-pressed={isInContext}
          className={`h-7 px-2 rounded-sm text-xs flex items-center gap-1.5 transition-colors ${
            isInContext
              ? 'bg-accent-muted text-accent hover:bg-accent-subtle'
              : 'text-text-muted hover:text-text-primary hover:bg-surface-3'
          }`}
        >
          {isInContext ? <CheckIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
          <span>{isInContext ? 'In context' : 'Add to context'}</span>
        </button>
      </Tooltip>
      {isMarkdown && (
        <Tooltip content="Open in focus reader" side="bottom">
          <button
            type="button"
            onClick={handleEnterFocus}
            aria-label="Open in focus reader"
            className="w-7 h-7 flex items-center justify-center rounded-sm text-text-muted
                       hover:text-text-primary hover:bg-surface-3 transition-colors"
          >
            <BookOpenIcon className="w-4 h-4" />
          </button>
        </Tooltip>
      )}
      <Tooltip content="Close file" side="bottom">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close file"
          className="w-7 h-7 flex items-center justify-center rounded-sm text-text-muted
                     hover:text-text-primary hover:bg-surface-3 transition-colors"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </Tooltip>
    </>
  );

  // The raw failure is usually a system string ("Error: EACCES..."), which names
  // no recovery. Lead with what happened to the user's work, keep the raw text
  // one hover away for whoever needs it, and offer the write again.
  const saveErrorBanner = document.saveError ? (
    <div className="px-3 py-2 bg-danger-muted border-b border-border-subtle flex items-start gap-2" role="alert">
      <WarningTriangleIcon className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-danger">
          Could not write {filename} to disk. Your edits are still open here.
        </p>
        <Tooltip content={document.saveError} side="bottom">
          <p className="text-tiny text-text-secondary truncate cursor-default">{document.saveError}</p>
        </Tooltip>
      </div>
      <button
        type="button"
        onClick={handleRetrySave}
        disabled={saveStatus === 'saving'}
        className="btn btn-secondary h-7 px-2 text-xs flex-shrink-0"
      >
        Save again
      </button>
    </div>
  ) : null;

  if (isMarkdown) {
    return (
      <div className="flex flex-col h-full bg-surface-1">
        {saveErrorBanner}
        <div className="flex-1 overflow-hidden">
          <MarkdownEditorLazy
            content={document.content}
            onChange={handleContentChange}
            scrollKey={document.path}
            leading={identity}
            actions={fileActions}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface-1">
      <div className="flex items-center gap-2 px-3 py-1 min-w-0 bg-surface-1 border-b border-border-subtle">
        {identity}
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">{fileActions}</div>
      </div>

      {saveErrorBanner}

      <div className="flex-1 overflow-hidden">
        <CodeEditorLazy
          path={document.path}
          content={document.content}
          onChange={handleContentChange}
        />
      </div>
    </div>
  );
});
