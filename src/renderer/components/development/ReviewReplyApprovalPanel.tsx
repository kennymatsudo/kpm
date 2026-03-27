import { useState } from 'react';

interface ReviewReplyApprovalPanelProps {
  draft: {
    threadUrl: string;
    threadTitle: string;
    threadLocation: string;
    latestCommentPreview: string | null;
    body: string;
    resolve: boolean;
  };
  onApprove: (body: string, resolve: boolean) => Promise<void>;
  onDismiss: () => void;
  embedded?: boolean;
}

function LoadingSpinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function ReviewReplyApprovalPanel({
  draft,
  onApprove,
  onDismiss,
  embedded = false,
}: ReviewReplyApprovalPanelProps) {
  const [body, setBody] = useState(draft.body);
  const [shouldResolve, setShouldResolve] = useState(draft.resolve);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const containerClass = embedded ? 'h-full' : 'max-w-[32rem] mx-auto';

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await onApprove(body.trim(), shouldResolve);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`flex flex-col ${containerClass}`}>
      <div className="flex-shrink-0 px-4 py-3 bg-surface-0/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5m-9 7l3.5-3.5H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h3.5L12 21z" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-text-primary">Review Reply Approval</p>
            <p className="text-xxs text-text-muted">Edit the draft before posting it to GitHub</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 bg-surface-1 space-y-4">
        <div>
          <div className="text-xxs font-medium text-text-tertiary uppercase tracking-wide mb-1">Thread</div>
          <div className="text-sm font-medium text-text-primary leading-snug break-words">
            {draft.threadTitle}
          </div>
          <div className="mt-1 text-xxs text-text-muted">{draft.threadLocation}</div>
        </div>

        {draft.latestCommentPreview && (
          <div>
            <div className="text-xxs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Latest Reviewer Comment
            </div>
            <div className="rounded-lg border border-border-subtle bg-surface-2 p-3">
              <p className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed">
                {draft.latestCommentPreview}
              </p>
            </div>
          </div>
        )}

        <div>
          <div className="text-xxs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
            Draft Reply
          </div>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={8}
            className="w-full rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="Write a concise GitHub reply..."
          />
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2">
          <input
            type="checkbox"
            checked={shouldResolve}
            onChange={(event) => setShouldResolve(event.target.checked)}
            className="mt-0.5"
          />
          <span className="text-xs text-text-secondary">
            Resolve the thread after posting this reply.
          </span>
        </label>

        <button
          type="button"
          className="text-xxs text-text-muted hover:text-text-secondary transition-colors"
        >
          Open thread on GitHub
        </button>
      </div>

      <div className="flex-shrink-0 px-3 py-2.5 border-t border-border-subtle bg-surface-2">
        <div className="flex gap-2">
          <button
            onClick={onDismiss}
            disabled={isSubmitting}
            className="flex-1 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary bg-surface-3 hover:bg-surface-4 rounded transition-colors border border-border-subtle disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Dismiss
          </button>
          <button
            onClick={() => void handleApprove()}
            disabled={isSubmitting || body.trim().length === 0}
            className="flex-[1.5] px-3 py-2 text-xs font-semibold text-white bg-accent hover:bg-accent/90 rounded transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner className="w-3.5 h-3.5" />
                <span>Posting...</span>
              </>
            ) : (
              <span>{shouldResolve ? 'Post Reply + Resolve' : 'Post Reply'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
