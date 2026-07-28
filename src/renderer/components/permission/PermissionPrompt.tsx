/**
 * Inline permission prompt component.
 *
 * Displays inline in chat when a provider requests permission for an action.
 * Pattern: inline prompt (not a modal).
 */

import { usePermissionStore } from '../../stores';
import { useShallow } from 'zustand/react/shallow';
import { UnlockIcon } from '../icons';

interface PermissionPromptProps {
  chatSessionId: string | null;
}

export function PermissionPrompt({ chatSessionId }: PermissionPromptProps) {
  const { pendingRequest, respond } = usePermissionStore(useShallow((state) => ({
    pendingRequest: chatSessionId
      ? state.pendingRequests.get(chatSessionId)?.[0] ?? null
      : state.unscopedPendingRequests[0] ?? null,
    respond: state.respond,
  })));

  if (!pendingRequest) {
    return null;
  }

  const isWriteAccess = pendingRequest.kind === 'write-access';
  const mutedButton = 'px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface-3 hover:bg-surface-4 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  const primaryButton = 'px-3 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <div
      role="group"
      aria-label={isWriteAccess ? 'Conversation write request' : 'Permission request'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          respond(pendingRequest, 'deny');
        }
      }}
      className="mx-4 my-2 border border-border rounded-lg overflow-hidden bg-surface-2"
    >
      <div className="bg-surface-3 px-4 py-2.5 flex items-center gap-2">
        <UnlockIcon className="w-4 h-4 text-accent flex-shrink-0" />
        <span className="text-sm font-medium text-text-primary">
          {isWriteAccess ? 'Allow writes for this conversation?' : 'Allow this action?'}
        </span>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {pendingRequest.title && (
          <div className="text-sm text-text-primary mb-3">{pendingRequest.title}</div>
        )}

        <div className="text-sm text-text-primary mb-3">
          <pre className="font-mono text-xs bg-surface-3 px-2 py-1 rounded max-h-40 overflow-auto whitespace-pre-wrap break-all">
            {pendingRequest.preview}
          </pre>
        </div>

        {pendingRequest.targetPath && (
          <div className="text-xs text-text-secondary mb-3 font-mono">
            {pendingRequest.targetPath}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button autoFocus onClick={() => respond(pendingRequest, 'deny')} className={mutedButton}>
            Don't Allow
          </button>
          <button onClick={() => respond(pendingRequest, 'allow')} className={primaryButton}>
            {isWriteAccess ? 'Allow for this conversation' : 'Allow'}
          </button>
          {!isWriteAccess && (
            <>
              <button onClick={() => respond(pendingRequest, 'allow-all-remaining')} className={mutedButton}>
                Allow All Remaining
              </button>
              <button onClick={() => respond(pendingRequest, 'allow-always')} className={mutedButton}>
                Allow Always
              </button>
            </>
          )}
        </div>

        <p className="text-xs text-text-tertiary mt-2">
          {isWriteAccess
            ? 'Covers direct file changes, shell commands, and git operations until revoked or KPM restarts. Credential and secret paths stay blocked.'
            : 'Allow All Remaining covers the rest of this response. Allow Always covers this session.'}
        </p>
      </div>
    </div>
  );
}
