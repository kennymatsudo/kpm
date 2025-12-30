import { CloseIcon } from '../../icons';

interface Props {
  error: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  variant?: 'inline' | 'banner';
}

/**
 * Error display component for sync operations.
 * - `inline`: Compact inline error message
 * - `banner`: Full-width banner with action buttons
 */
export function SyncErrorBanner({ error, onRetry, onDismiss, variant = 'inline' }: Props) {
  if (variant === 'inline') {
    return (
      <div className="text-sm p-3 rounded-lg bg-danger-muted text-danger flex items-center gap-2">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="flex-1">{error}</span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-danger hover:text-red-300 p-0.5 rounded transition-colors"
            aria-label="Dismiss"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg bg-danger-muted border border-danger/20">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-danger-muted flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-danger mb-1">Sync Error</h4>
          <p className="text-sm text-text-muted">{error}</p>
          {(onRetry || onDismiss) && (
            <div className="flex gap-2 mt-3">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="px-3 py-1.5 text-xs bg-danger-muted text-danger rounded-md hover:bg-danger/25 transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Retry
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary rounded-md hover:bg-surface-3 transition-colors"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
