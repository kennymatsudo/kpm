import { useState } from 'react';

interface CommentBoxProps {
  initialBody?: string;
  /** Right-aligned label, for example "Comment on lines R12-R15". */
  heading: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

export function CommentBox({ initialBody = '', heading, onSubmit, onCancel }: CommentBoxProps) {
  const [body, setBody] = useState(initialBody);
  const canSubmit = body.trim().length > 0;
  const submit = () => {
    if (canSubmit) onSubmit(body.trim());
  };

  return (
    <div className="rounded-md border border-border-subtle bg-surface-1 p-2 font-sans">
      <div className="mb-1 text-right text-xs text-text-tertiary">{heading}</div>
      <textarea
        autoFocus
        value={body}
        rows={3}
        placeholder="Leave a comment"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        className="w-full resize-y rounded-md border border-border-subtle bg-surface-0 p-2 text-sm text-text-primary"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={submit}>
          Comment
        </button>
      </div>
    </div>
  );
}
