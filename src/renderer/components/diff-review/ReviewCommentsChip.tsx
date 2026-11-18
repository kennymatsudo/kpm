import { memo } from 'react';
import { useDiffReviewStore } from '../../stores/diffReviewStore';
import { CloseIcon } from '../icons';

const NO_COMMENTS: never[] = [];

export const ReviewCommentsChip = memo(function ReviewCommentsChip({ chatSessionId }: { chatSessionId: string }) {
  const count = useDiffReviewStore((state) => (state.commentsBySession[chatSessionId] ?? NO_COMMENTS).length);
  const held = useDiffReviewStore((state) => state.heldBySession[chatSessionId] ?? false);
  const setHeld = useDiffReviewStore((state) => state.setHeld);
  if (count === 0) return null;

  const label = `${count} ${count === 1 ? 'comment' : 'comments'}`;
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
        held ? 'border-border-subtle text-text-tertiary line-through' : 'border-accent text-accent bg-accent-subtle'
      }`}
    >
      <button type="button" onClick={() => setHeld(chatSessionId, !held)} aria-pressed={!held}>
        {held ? `${label} held` : label}
      </button>
      {!held && (
        <button type="button" onClick={() => setHeld(chatSessionId, true)} aria-label="Hold comments for a later message">
          <CloseIcon className="w-3 h-3" />
        </button>
      )}
    </div>
  );
});
