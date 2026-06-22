/**
 * CommitComposer - Inline commit editor shown inside the Changes tab when
 * "Ready for Review" or the Changes-tab "Commit" button is used and there are
 * uncommitted changes in the agent session's worktree.
 *
 * Auto-generates a commit message (grounded in the worktree diff, following the
 * same principles as the /commit skill), then lets the user edit before
 * confirming. Rendered inline as a section of the panel — not a floating
 * popover — so it reads as part of the Changes view.
 */

import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { generateCommitMessage } from '../../services/agentSessionService';
import type { DevSessionWithPlanItem } from '../../../shared/types';

interface CommitComposerProps {
  session: DevSessionWithPlanItem;
  /** Pre-fill (e.g. retry after a failed commit) — skips generation. */
  initialMessage?: string;
  submitLabel?: string;
  /** Show the "Skip to Review" action (only meaningful on the review path). */
  showSkip?: boolean;
  /** Called when user cancels — does NOT move to in_review */
  onCancel: () => void;
  /** Called after user confirms the commit message */
  onSubmit: (message: string) => void;
  /** Called when user skips — parent moves to in_review */
  onComplete: () => void;
}

export const CommitComposer = memo(function CommitComposer({
  session,
  initialMessage,
  submitLabel = 'Commit',
  showSkip = false,
  onCancel,
  onSubmit,
  onComplete,
}: CommitComposerProps) {
  const [message, setMessage] = useState(initialMessage ?? '');
  const [isGenerating, setIsGenerating] = useState(!initialMessage);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const taskTitle = session.plan_item?.title ?? session.name ?? 'Task';
  const externalKey = session.plan_item?.external_key ?? undefined;

  // Fallback message if generation fails
  const fallbackMessage = externalKey ? `[${externalKey}] ${taskTitle}` : taskTitle;

  // Generate exactly once per open. The `cancelled` guard prevents a stale
  // response from overwriting the editor if the session changes mid-flight.
  useEffect(() => {
    if (initialMessage) {
      setMessage(initialMessage);
      setIsGenerating(false);
      return;
    }

    let cancelled = false;
    setIsGenerating(true);
    setMessage('');
    void (async () => {
      try {
        const result = await generateCommitMessage(session.id, taskTitle, externalKey);
        if (cancelled) return;
        setMessage(result.success && result.message ? result.message : fallbackMessage);
      } catch {
        if (!cancelled) setMessage(fallbackMessage);
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialMessage, session.id, taskTitle, externalKey, fallbackMessage]);

  useEffect(() => {
    if (!isGenerating) {
      textareaRef.current?.focus();
    }
  }, [isGenerating]);

  const handleCommit = useCallback(() => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;
    onSubmit(trimmedMessage);
  }, [message, onSubmit]);

  return (
    <div className="border-b border-border-subtle bg-surface-1">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-xs font-semibold text-text-primary">Commit changes</h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="text-text-muted hover:text-text-primary p-0.5 rounded hover:bg-surface-3 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Commit message editor */}
      <div className="px-3 pb-2">
        {isGenerating ? (
          <div className="w-full h-24 bg-surface-0 border border-border-subtle rounded-lg flex items-center justify-center gap-2">
            <svg className="w-3.5 h-3.5 animate-spin text-text-muted" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
              <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="text-xs text-text-muted">Generating...</span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            autoFocus
            className="w-full text-sm bg-surface-0 border border-border-subtle rounded-lg px-2.5 py-2 text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-accent font-mono leading-relaxed"
            placeholder="Enter commit message..."
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-surface-3 transition-colors"
        >
          Cancel
        </button>
        {showSkip && (
          <button
            onClick={onComplete}
            className="px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-surface-3 transition-colors"
          >
            Skip to Review
          </button>
        )}
        <button
          onClick={handleCommit}
          disabled={isGenerating || !message.trim()}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
});
