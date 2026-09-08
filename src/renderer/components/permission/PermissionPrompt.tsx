/**
 * Inline permission prompt component.
 *
 * Displays inline in chat for the two things KPM asks about: the project's
 * write grant, and an MCP server asking the user for input. Pattern: inline
 * prompt (not a modal).
 */

import { usePermissionStore } from '../../stores';
import { useShallow } from 'zustand/react/shallow';
import { UnlockIcon } from '../icons';

/** What the write grant actually opens up, stated before the user agrees to it
 * rather than summarized after. It has no expiry, so this is the one moment
 * the full extent is on screen. */
const WRITE_ACCESS_COVERAGE = [
  'Creating, editing, and deleting files',
  'Running shell commands',
  'Git operations, including commits and pushing a branch',
];

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
  const mutedButton = 'px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface-3 hover:bg-surface-4 rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <div
      role="group"
      aria-label={isWriteAccess ? 'Project write request' : 'Input request'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          respond(pendingRequest, 'deny');
        }
      }}
      className={`my-2 rounded-md overflow-hidden bg-surface-elevated ${
        isWriteAccess ? 'border border-border-strong' : 'border border-border-default'
      }`}
    >
      <div
        className={`px-3 py-2 flex items-center gap-2 border-b ${
          isWriteAccess
            ? 'bg-accent-subtle border-border-default'
            : 'bg-surface-2 border-border-subtle'
        }`}
      >
        <UnlockIcon className="w-4 h-4 text-accent flex-shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium text-text-primary">
          {isWriteAccess ? 'Allow writes in this project?' : 'Allow this action?'}
        </span>
      </div>

      <div className="px-3 py-3">
        {pendingRequest.title && (
          <div className="text-sm text-text-primary mb-2">{pendingRequest.title}</div>
        )}

        <pre className="font-mono text-xs text-text-secondary bg-surface-code border border-border-subtle px-2 py-1.5 rounded-sm max-h-40 overflow-auto whitespace-pre-wrap break-all mb-2">
          {pendingRequest.preview}
        </pre>

        {pendingRequest.targetPath && (
          <div className="text-xs text-text-tertiary mb-3 font-mono break-all">
            {pendingRequest.targetPath}
          </div>
        )}

        {isWriteAccess && (
          <ul className="text-xs text-text-secondary mb-3 space-y-1">
            {WRITE_ACCESS_COVERAGE.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span
                  className="w-1 h-1 rounded-full bg-text-muted flex-shrink-0 mt-1.5"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button autoFocus onClick={() => respond(pendingRequest, 'deny')} className={mutedButton}>
            {isWriteAccess ? "Don't allow" : 'Decline'}
          </button>
          <button onClick={() => respond(pendingRequest, 'allow')} className="btn btn-primary">
            {isWriteAccess ? 'Always allow in this project' : 'Accept'}
          </button>
        </div>

        {isWriteAccess && (
          <p className="text-xs text-text-tertiary mt-2">
            Applies to every chat in this project and stays on after a restart. Turn it
            off in Settings, Permissions.
          </p>
        )}
      </div>
    </div>
  );
}
