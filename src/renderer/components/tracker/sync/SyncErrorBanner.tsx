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
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="flex-1">{error}</span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
          >
          </button>
        )}
      </div>
    );
  }

  return (
      <div className="flex items-start gap-3">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-muted">{error}</p>
          {(onRetry || onDismiss) && (
            <div className="flex gap-2 mt-3">
              {onRetry && (
                <button
                  onClick={onRetry}
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
