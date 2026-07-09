interface PendingMovePanelProps {
  sourcePath: string;
  targetPath: string;
  onConfirm: () => void;
  onDismiss: () => void;
  isApplying?: boolean;
  embedded?: boolean;
}

export function PendingMovePanel({
  sourcePath,
  targetPath,
  onConfirm,
  onDismiss,
  isApplying = false,
  embedded = false,
}: PendingMovePanelProps) {
  const body = (
    <div className="space-y-4">
      <div className="rounded-lg border border-border-subtle bg-surface-2 p-4 space-y-3">
        <div>
          <div className="text-xxs uppercase tracking-wide text-text-muted mb-1">From</div>
          <code className="text-sm text-text-primary break-all">{sourcePath}</code>
        </div>
        <div>
          <div className="text-xxs uppercase tracking-wide text-text-muted mb-1">To</div>
          <code className="text-sm text-text-primary break-all">{targetPath}</code>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          disabled={isApplying}
          className="px-3 py-1.5 text-sm rounded border border-border-subtle text-text-secondary hover:bg-surface-hover disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isApplying}
          className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {isApplying ? 'Moving…' : 'Move'}
        </button>
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">Confirm move</h3>
      {body}
    </div>
  );
}
