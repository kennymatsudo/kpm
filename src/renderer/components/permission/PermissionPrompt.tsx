/**
 * Inline permission prompt component.
 *
 * Displays inline in chat when Claude requests permission for an action.
 * Pattern: Cursor/Claude Code style inline prompt (not a modal).
 */

import { usePermissionStore } from '../../stores';
import { useShallow } from 'zustand/react/shallow';

export function PermissionPrompt() {
  const { pendingRequest, respond } = usePermissionStore(useShallow((state) => ({
    pendingRequest: state.pendingRequest,
    respond: state.respond,
  })));

  if (!pendingRequest) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label="Permission request"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          respond('deny');
        }
      }}
      className="mx-4 my-2 border border-border rounded-lg overflow-hidden bg-surface-2"
    >
      {/* Header */}
      <div className="bg-surface-3 px-4 py-2.5 flex items-center gap-2">
        <svg className="w-4 h-4 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span className="text-sm font-medium text-text-primary">
          {pendingRequest.displayName ? `Claude wants to: ${pendingRequest.displayName}` : 'Claude wants permission'}
        </span>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {pendingRequest.title ? (
          <div className="text-sm text-text-primary mb-3">
            {pendingRequest.title}
          </div>
        ) : (
          <div className="text-sm text-text-primary mb-3">
            <pre className="font-mono text-xs bg-surface-3 px-2 py-1 rounded max-h-40 overflow-auto whitespace-pre-wrap break-all">
              {pendingRequest.preview}
            </pre>
          </div>
        )}

        {pendingRequest.description && (
          <div className="text-xs text-text-secondary mb-2">
            {pendingRequest.description}
          </div>
        )}

        {pendingRequest.targetPath && !pendingRequest.title && (
          <div className="text-xs text-text-secondary mb-3 font-mono">
            {pendingRequest.targetPath}
          </div>
        )}

        {/* Actions. Safe-by-default: the prominent button grants the narrowest
            scope (single action); broader-scope options are visually muted. */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            autoFocus
            onClick={() => respond('deny')}
            className="px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface-3 hover:bg-surface-4 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Don't Allow
          </button>
          <button
            onClick={() => respond('allow')}
            className="px-3 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Allow
          </button>
          <button
            onClick={() => respond('allow-all-remaining')}
            className="px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface-3 hover:bg-surface-4 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Allow All Remaining
          </button>
          <button
            onClick={() => respond('allow-always')}
            className="px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface-3 hover:bg-surface-4 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Allow Always
          </button>
        </div>

        <p className="text-xs text-text-tertiary mt-2">
          Allow All Remaining covers the rest of this response. Allow Always covers this session.
        </p>
      </div>
    </div>
  );
}
