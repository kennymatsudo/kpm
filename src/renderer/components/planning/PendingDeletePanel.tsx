import { useState } from 'react';

interface PendingDeletePanelProps {
  filePath: string;
  isDirectory: boolean;
  onConfirm: () => Promise<void>;
  onDismiss: () => void;
  isApplying?: boolean;
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

export function PendingDeletePanel({
  filePath,
  isDirectory,
  onConfirm,
  onDismiss,
  isApplying = false,
  embedded = false,
}: PendingDeletePanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const busy = isSubmitting || isApplying;

  const containerClass = embedded ? 'h-full' : 'max-w-[32rem] mx-auto';
  const kind = isDirectory ? 'folder' : 'file';

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`flex flex-col ${containerClass}`}>
      <div className="flex-shrink-0 px-4 py-3 bg-surface-0/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-danger/15 flex items-center justify-center text-danger">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-text-primary">Confirm Deletion</p>
            <p className="text-xxs text-text-muted">This action cannot be undone</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 bg-surface-1 space-y-4">
        <div>
          <div className="text-xxs font-medium text-text-tertiary uppercase tracking-wide mb-1">
            {isDirectory ? 'Folder' : 'File'}
          </div>
          <div className="text-sm font-medium text-text-primary leading-snug break-all font-mono">
            {filePath}
          </div>
        </div>

        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3">
          <p className="text-xs text-text-secondary leading-relaxed">
            {isDirectory
              ? `Permanently delete this folder and everything inside it? This ${kind} will be removed from disk and cannot be recovered.`
              : `Permanently delete this ${kind}? It will be removed from disk and cannot be recovered.`}
          </p>
        </div>
      </div>

      <div className="flex-shrink-0 px-3 py-2.5 border-t border-border-subtle bg-surface-2">
        <div className="flex gap-2">
          <button
            onClick={onDismiss}
            disabled={busy}
            className="flex-1 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary bg-surface-3 hover:bg-surface-4 rounded transition-colors border border-border-subtle disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={busy}
            className="flex-[1.5] px-3 py-2 text-xs font-semibold text-white bg-danger hover:bg-danger/90 rounded transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <LoadingSpinner className="w-3.5 h-3.5" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>Delete {isDirectory ? 'Folder' : 'File'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
