/**
 * PendingDocumentPanel - Review and approve proposed document updates from Claude.
 *
 * Two states:
 * 1. Collapsed: Floating panel at bottom with summary and quick actions
 * 2. Expanded: Full modal with diff view and edit capability
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { Markdown } from 'markdown-to-jsx';
import { CloseIcon } from '../icons';
import { LoadingSpinner } from '../ui/LoadingButton';
import { MotionButton } from '../ui/MotionButton';
import { DiffViewer, computeDiff, getDiffStatsFromDiff } from '../ui/DiffViewer';
import { Z_INDEX } from '../../constants/zIndex';
import { getBaseName } from '../../utils/path';

interface PendingDocumentPanelProps {
  filePath: string;
  content: string;
  oldContent: string | null;
  onAccept: (content: string) => void;
  onDismiss: () => void;
  isApplying?: boolean;
  /** When true, renders inline content for embedding in a side panel (no floating panel/modal) */
  embedded?: boolean;
}

type ViewMode = 'diff' | 'preview' | 'edit';

export function PendingDocumentPanel({
  filePath,
  content,
  oldContent,
  onAccept,
  onDismiss,
  isApplying = false,
  embedded = false,
}: PendingDocumentPanelProps) {
  const isNewFile = oldContent === null || oldContent.trim() === '';
  const [viewMode, setViewMode] = useState<ViewMode>(isNewFile ? 'preview' : 'diff');
  const [isExpanded, setIsExpanded] = useState(false);
  const [editedContent, setEditedContent] = useState(content);

  // Sync editedContent when content prop changes (e.g. accumulated edits replacing queue item)
  useEffect(() => {
    setEditedContent(content);
  }, [content]);

  // Reset edited content when content prop changes
  const handleExpand = useCallback(() => {
    setEditedContent(content);
    setIsExpanded(true);
  }, [content]);
  const fileName = getBaseName(filePath, 'Document');

  const summaryDiffLines = useMemo(
    () => computeDiff(oldContent, content),
    [oldContent, content]
  );
  const { addedCount, removedCount } = useMemo(
    () => getDiffStatsFromDiff(summaryDiffLines),
    [summaryDiffLines]
  );
  const editedDiffLines = useMemo(
    () => computeDiff(oldContent, editedContent),
    [oldContent, editedContent]
  );

  // Collapsed panel (floating at bottom)
  const collapsedPanel = (
    <m.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2
                  bg-surface-2 border-2 border-accent rounded shadow-md
                  p-3 w-[28rem]"
      style={{ zIndex: Z_INDEX.panel }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="pulse-dot" />
        <span className="text-sm font-medium text-accent">
          Document Update
        </span>
      </div>

      {/* File info */}
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-sm text-text-primary font-medium truncate">{fileName}</span>
        <span className="text-xs text-text-muted truncate">{filePath}</span>
      </div>

      {/* Summary */}
      <div className="text-sm text-text-secondary mb-3">
        {isNewFile ? (
          <span>Create new file ({content.split('\n').length} lines)</span>
        ) : (
          <span className="flex items-center gap-3">
            <span className="text-success font-medium">+{addedCount}</span>
            <span className="text-danger font-medium">-{removedCount}</span>
            <span className="text-text-muted">lines changed</span>
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <MotionButton
          variant="secondary"
          onClick={handleExpand}
          className="flex-1"
        >
          Review Changes
        </MotionButton>
        <MotionButton
          variant="primary"
          onClick={() => onAccept(content)}
          disabled={isApplying}
          className="flex-1 disabled:opacity-70"
        >
          {isApplying ? (
            <span className="flex items-center gap-2">
              <LoadingSpinner className="w-3.5 h-3.5" color="white" />
              Saving...
            </span>
          ) : (
            'Accept'
          )}
        </MotionButton>
        <MotionButton
          variant="secondary"
          onClick={onDismiss}
          disabled={isApplying}
          className="disabled:opacity-50"
        >
          Dismiss
        </MotionButton>
      </div>
    </m.div>
  );

  // Expanded modal with full diff/edit view
  const expandedModal = createPortal(
    <AnimatePresence>
      {isExpanded && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-overlay flex items-center justify-center"
          style={{ zIndex: Z_INDEX.modal }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isApplying) setIsExpanded(false);
          }}
        >
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="dialog-content w-[900px] max-w-[90vw] h-[80vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border-subtle bg-surface-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-text-primary">{fileName}</h3>
                  <p className="text-xs text-text-muted">Claude proposed: {filePath}</p>
                </div>
                {!isNewFile && (
                  <div className="flex items-center gap-2 text-xs font-medium ml-4">
                    <span className="text-success">+{addedCount}</span>
                    <span className="text-danger">-{removedCount}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* View mode toggle */}
                <div className="flex bg-surface-3 rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode('diff')}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      viewMode === 'diff'
                        ? 'bg-surface-1 text-text-primary shadow-sm'
                        : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    Diff
                  </button>
                  <button
                    onClick={() => setViewMode('preview')}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      viewMode === 'preview'
                        ? 'bg-surface-1 text-text-primary shadow-sm'
                        : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => setViewMode('edit')}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      viewMode === 'edit'
                        ? 'bg-surface-1 text-text-primary shadow-sm'
                        : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    Edit
                  </button>
                </div>
                <MotionButton
                  scalePreset="default"
                  onClick={() => setIsExpanded(false)}
                  disabled={isApplying}
                  className="text-text-muted hover:text-text-primary transition-colors p-1 hover:bg-surface-3 rounded disabled:opacity-50"
                >
                  <CloseIcon className="w-5 h-5" />
                </MotionButton>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 bg-surface-1">
              {viewMode === 'diff' ? (
                <DiffViewer oldContent={oldContent || ''} newContent={editedContent} diffLines={editedDiffLines} autoScrollToFirstChange />
              ) : viewMode === 'preview' ? (
                <div className="prose-themed prose-panel bg-surface-2 p-4 rounded-lg border border-border-subtle overflow-y-auto overflow-x-hidden">
                  <Markdown options={markdownOptions}>
                  </Markdown>
                </div>
              ) : (
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="w-full h-full font-mono text-xs text-text-primary bg-surface-2 p-4 rounded-lg border border-border-subtle resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
                  spellCheck={false}
                />
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center gap-2 p-4 border-t border-border-subtle bg-surface-2">
              <div className="text-xs text-text-muted">
                {viewMode === 'edit' && editedContent !== content && (
                  <span className="text-warning">Modified from original</span>
                )}
              </div>
              <div className="flex gap-2">
                <MotionButton
                  variant="secondary"
                  onClick={onDismiss}
                  disabled={isApplying}
                  className="disabled:opacity-50"
                >
                  Dismiss
                </MotionButton>
                <MotionButton
                  variant="primary"
                  onClick={() => {
                    onAccept(editedContent);
                    setIsExpanded(false);
                  }}
                  disabled={isApplying}
                  className="disabled:opacity-70"
                >
                  {isApplying ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner className="w-3.5 h-3.5" color="white" />
                      Saving...
                    </span>
                  ) : (
                    'Accept Changes'
                  )}
                </MotionButton>
              </div>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body
  );

  // Embedded mode: render inline content for side panel
  if (embedded) {
    return (
      <div className="flex flex-col h-full">
        {/* File info header */}
        <div className="flex-shrink-0 px-4 py-3 bg-surface-0/50">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-text-primary truncate">{fileName}</p>
              <p className="text-xxs text-text-muted truncate">{filePath}</p>
            </div>
            {!isNewFile && (
              <div className="flex items-center gap-2 text-xxs font-medium flex-shrink-0">
                <span className="text-success">+{addedCount}</span>
                <span className="text-danger">-{removedCount}</span>
              </div>
            )}
          </div>
          {isNewFile && (
            <p className="text-xxs text-text-muted mt-1.5">
              New file ({content.split('\n').length} lines)
            </p>
          )}
        </div>

        {/* View mode toggle */}
        <div className="flex-shrink-0 px-4 py-2 border-y border-border-subtle bg-surface-0">
          <div className="flex bg-surface-3 rounded-lg p-0.5 w-fit">
            <button
              onClick={() => setViewMode('diff')}
              className={`px-3 py-1 text-xxs font-medium rounded-md transition-colors ${
                viewMode === 'diff'
                  ? 'bg-surface-1 text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Diff
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`px-3 py-1 text-xxs font-medium rounded-md transition-colors ${
                viewMode === 'preview'
                  ? 'bg-surface-1 text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => setViewMode('edit')}
              className={`px-3 py-1 text-xxs font-medium rounded-md transition-colors ${
                viewMode === 'edit'
                  ? 'bg-surface-1 text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Edit
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto p-4 bg-surface-1">
          {viewMode === 'diff' ? (
            <DiffViewer oldContent={oldContent || ''} newContent={editedContent} diffLines={editedDiffLines} autoScrollToFirstChange />
          ) : viewMode === 'preview' ? (
            <div className="prose-themed prose-panel bg-surface-2 p-4 rounded-lg border border-border-subtle overflow-y-auto overflow-x-hidden">
              <Markdown options={markdownOptions}>
                {transformPlanRefs(editedContent)}
              </Markdown>
            </div>
          ) : (
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full h-full min-h-[200px] font-mono text-xs text-text-primary bg-surface-2 p-4 rounded-lg border border-border-subtle resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
              spellCheck={false}
            />
          )}
        </div>

        {/* Edit indicator */}
        {viewMode === 'edit' && editedContent !== content && (
          <div className="flex-shrink-0 px-4 py-2 bg-warning/8 border-t border-warning/20">
            <p className="text-xxs text-warning">Modified from original proposal</p>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex-shrink-0 px-3 py-2.5 border-t border-border-subtle bg-surface-2">
          <div className="flex gap-2">
            <button
              onClick={onDismiss}
              disabled={isApplying}
              className="flex-1 px-3 py-2 text-xs font-medium
                         text-text-secondary hover:text-text-primary
                         bg-surface-3 hover:bg-surface-4
                         rounded transition-colors duration-100
                         border border-border-subtle
                         active:opacity-90
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-surface-3"
            >
              Dismiss
            </button>
            <button
              onClick={() => onAccept(editedContent)}
              disabled={isApplying}
              className="flex-[1.5] px-3 py-2 text-xs font-semibold text-white
                         bg-[color-mix(in_srgb,var(--color-accent)_85%,black)]
                         hover:bg-accent
                         rounded transition-colors duration-100
                         active:opacity-90
                         disabled:opacity-70 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2"
            >
              {isApplying ? (
                <>
                  <LoadingSpinner className="w-3.5 h-3.5" color="white" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Accept Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {!isExpanded && collapsedPanel}
      </AnimatePresence>
      {expandedModal}
    </>
  );
}
