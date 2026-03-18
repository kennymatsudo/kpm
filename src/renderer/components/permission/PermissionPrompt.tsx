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
              {pendingRequest.preview}
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

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => respond('deny')}
          >
            Don't Allow
          </button>
          <button
            onClick={() => respond('allow')}
          >
            Allow
          </button>
          <button
            onClick={() => respond('allow-all-remaining')}
          >
            Allow All Remaining
          </button>
          <button
            onClick={() => respond('allow-always')}
          >
            Allow Always
          </button>
        </div>

        <p className="text-xs text-text-tertiary mt-2">
        </p>
      </div>
    </div>
  );
}
