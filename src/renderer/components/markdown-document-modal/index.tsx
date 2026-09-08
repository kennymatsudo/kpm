/**
 * MarkdownDocumentModal - a markdown file opened as a dialog, from the planning
 * view's file tree or as a proposed document awaiting acceptance.
 *
 * The reading, editing, and find behaviour all come from the shared
 * `MarkdownEditor`, which the workspace file panel also mounts, so a file looks
 * and behaves the same wherever you opened it. What is specific here is the
 * dialog frame: a buffered draft with an explicit Save (a proposal has to be
 * accepted, not autosaved), a diff against the version on disk, and the
 * reconciliation banner for a file that changed underneath an unsaved edit.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { BookOpenIcon, CloseIcon, WarningTriangleIcon } from '../icons';
import { MotionButton } from '../ui/MotionButton';
import { Tooltip } from '../ui/Tooltip';
import { ConfirmActionDialog } from '../ui/ConfirmActionDialog';
import { MarkdownEditorLazy, type MarkdownView } from '../ui';
import { DiffViewer, computeDiff, getDiffStatsFromDiff } from '../ui/DiffViewer';
import { Z_INDEX } from '../../constants/zIndex';

/** Flat ease-out, matching the app's 150ms interaction transitions. */
const EASE_OUT = [0, 0, 0.2, 1] as const;

interface MarkdownDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (content: string) => void;
  onDelete?: () => void;
  isDeleting?: boolean;
  title: string;
  subtitle: string;
  content: string;
  icon: React.ReactNode;
  initialEditMode?: boolean;
  /** Show Accept button in preview mode (for proposed documents) */
  showAcceptButton?: boolean;
  /** Original content for diff view (null for new documents) */
  oldContent?: string | null;
  /** Stable identity for the document (e.g. file path), used to remember scroll position across opens */
  documentKey?: string;
  /** When provided, shows a "Focus" action that opens the document in the distraction-free reader. */
  onEnterFocusMode?: () => void;
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
  icon,
  initialEditMode = false,
  showAcceptButton = false,
  oldContent,
  documentKey,
  onEnterFocusMode,
}: MarkdownDocumentModalProps) {
  const [draft, setDraft] = useState(content);
  const [view, setView] = useState<MarkdownView>('preview');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Tracks the content version we've already synced into `draft`, so we can
  // tell apart "user is editing" from "the file changed underneath us."
  // The working-tree change tiering described in
  // `docs/shared-project-context.md` § "Detection layer" lives here.
  const [lastSyncedContent, setLastSyncedContent] = useState(content);
  const [externalChange, setExternalChange] = useState(false);

  const diffLines = useMemo(() => {
    if (oldContent === undefined) return null;
    return computeDiff(oldContent, content);
  }, [oldContent, content]);
  const diffStats = diffLines ? getDiffStatsFromDiff(diffLines) : null;

  const diff = useMemo(() => {
    if (oldContent === undefined || !diffStats) return undefined;
    return {
      added: diffStats.addedCount,
      removed: diffStats.removedCount,
      render: () => (
        <div className="max-w-4xl mx-auto">
          <DiffViewer oldContent={oldContent} newContent={content} diffLines={diffLines ?? undefined} />
        </div>
      ),
    };
  }, [oldContent, content, diffLines, diffStats]);

  // Reset the draft to fresh content on open. Intentionally keyed on `isOpen`
  // only — the effect below handles the in-flight case where `content` changes
  // while the modal is open, and syncing here would clobber unsaved edits.
  useEffect(() => {
    if (isOpen) {
      setDraft(content);
      setLastSyncedContent(content);
      setExternalChange(false);
      setConfirmDiscard(false);
      setView(oldContent !== undefined ? 'diff' : initialEditMode ? 'edit' : 'preview');
    }
  }, [isOpen]);

  // While the modal is open, if `content` changes from underneath us
  // (someone else wrote the file, a `git pull` / `git merge` updated it,
  // or the AI chat agent edited it), apply the appropriate tier:
  //
  //  - draft matches the last synced content → user has no unsaved edits;
  //    silently take the new content (silent tier).
  //  - draft differs → user has unsaved edits; surface a banner so they can
  //    pick reload-from-disk or keep-mine (soft prompt tier). Strong-prompt
  //    chat-stream gating is deferred — the modal is the user's active
  //    surface, soft prompt is the right default until streams are in scope.
  useEffect(() => {
    if (!isOpen) return;
    if (content === lastSyncedContent) return;
    if (draft === lastSyncedContent) {
      setDraft(content);
      setLastSyncedContent(content);
      setExternalChange(false);
    } else {
      setExternalChange(true);
    }
  }, [content, isOpen, draft, lastSyncedContent]);

  const reloadFromDisk = useCallback(() => {
    setDraft(content);
    setLastSyncedContent(content);
    setExternalChange(false);
  }, [content]);

  const dismissExternalChange = useCallback(() => {
    setLastSyncedContent(content);
    setExternalChange(false);
  }, [content]);

  const hasChanges = draft !== content;

  // Every close route lands here so an unsaved draft can never leave silently —
  // not via Escape, not via the overlay, not via the footer button.
  const requestClose = useCallback(() => {
    if (hasChanges) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }, [hasChanges, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && view === 'edit') {
        e.preventDefault();
        onSave(draft);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, view, draft, onSave]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: EASE_OUT }}
          className="dialog-overlay flex items-center justify-center"
          style={{ zIndex: Z_INDEX.modal }}
          onClick={(e) => e.target === e.currentTarget && requestClose()}
        >
          <m.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
            className="dialog-content w-[900px] min-w-[500px] max-w-[92vw] h-[85vh] max-h-[900px] flex flex-col overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-default flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {icon}
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-text-primary truncate">{title}</h3>
                  <p className="text-tiny text-text-muted truncate">{subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {onEnterFocusMode && !hasChanges && (
                  <Tooltip content="Open in focus reader" side="bottom">
                    <button
                      type="button"
                      onClick={onEnterFocusMode}
                      aria-label="Open in focus reader"
                      className="w-7 h-7 flex items-center justify-center rounded-sm text-text-muted
                                 hover:text-text-primary hover:bg-surface-3 transition-colors"
                    >
                      <BookOpenIcon className="w-4 h-4" />
                    </button>
                  </Tooltip>
                )}
                {onDelete && (
                  <Tooltip content="Delete document" side="bottom">
                    <button
                      type="button"
                      onClick={onDelete}
                      disabled={isDeleting}
                      aria-label="Delete document"
                      className="w-7 h-7 flex items-center justify-center rounded-sm text-text-muted
                                 hover:text-danger hover:bg-danger-muted transition-colors
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDeleting ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </Tooltip>
                )}
                <Tooltip content="Close (Esc)" side="bottom">
                  <button
                    type="button"
                    onClick={requestClose}
                    aria-label="Close"
                    className="w-7 h-7 flex items-center justify-center rounded-sm text-text-muted
                               hover:text-text-primary hover:bg-surface-3 transition-colors"
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Soft prompt for a file that changed on disk under an unsaved draft. */}
            {externalChange && (
              <div className="px-4 py-2 bg-warning-muted border-b border-border-default flex-shrink-0" role="alert">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 text-warning text-xs">
                    <WarningTriangleIcon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">This file changed on disk while you were editing.</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={dismissExternalChange}
                      className="h-7 px-2 rounded-sm text-xs text-warning hover:bg-surface-3 transition-colors"
                    >
                      Keep mine
                    </button>
                    <button
                      type="button"
                      onClick={reloadFromDisk}
                      className="h-7 px-2 rounded-sm text-xs font-medium text-warning bg-surface-3
                                 hover:bg-surface-4 transition-colors"
                    >
                      Reload from disk
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0">
              <MarkdownEditorLazy
                content={draft}
                onChange={setDraft}
                diff={diff}
                startInEdit={initialEditMode}
                scrollKey={documentKey}
                onViewChange={setView}
                onEscape={requestClose}
              />
            </div>

            <div className="flex items-center justify-between gap-4 px-4 py-2.5 border-t border-border-default
                            bg-surface-2 flex-shrink-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-tiny text-text-muted min-w-0">
                <ShortcutHint keys="⌘F" label="find" />
                <ShortcutHint keys="⌘E" label="switch view" />
                {view === 'edit' && (
                  <>
                    <ShortcutHint keys="⌘↵" label="save" />
                    <ShortcutHint keys="⌘B" label="bold" />
                    <ShortcutHint keys="⌘K" label="link" />
                  </>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <MotionButton variant="secondary" onClick={requestClose}>
                  {hasChanges ? 'Discard' : 'Close'}
                </MotionButton>
                {view !== 'edit' && showAcceptButton && (
                  <MotionButton variant="primary" onClick={() => onSave(draft)}>
                    Accept
                  </MotionButton>
                )}
                {view === 'edit' && (
                  <MotionButton
                    variant="primary"
                    onClick={() => onSave(draft)}
                    disabled={!hasChanges}
                    className="disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save changes
                  </MotionButton>
                )}
              </div>
            </div>
          </m.div>

          {confirmDiscard && (
            <ConfirmActionDialog
              title="Discard unsaved changes?"
              message="This document has unsaved changes that will be lost if you close it now."
              dialogId="markdown-document-unsaved"
              cancelLabel="Keep editing"
              onCancel={() => setConfirmDiscard(false)}
              action={{
                label: 'Discard changes',
                variant: 'danger',
                onClick: () => {
                  setConfirmDiscard(false);
                  onClose();
                },
              }}
            />
          )}
        </m.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function ShortcutHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="px-1.5 py-0.5 rounded-sm bg-surface-3 text-xxs font-mono text-text-secondary">{keys}</kbd>
      <span>{label}</span>
    </span>
  );
}
