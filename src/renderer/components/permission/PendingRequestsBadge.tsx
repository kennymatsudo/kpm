/**
 * Pending Requests Badge
 *
 * Topbar surface for permission requests the user cannot see from where they
 * are: a request in a background chat tab, or one in a project they switched
 * away from. Those requests block a turn for an hour and then auto-deny, so
 * without a global affordance the work just silently stalls.
 *
 * Answering still happens in one place — the inline `PermissionPrompt` in the
 * message list. A row here navigates to the request (switching projects if
 * needed) rather than duplicating the prompt's four actions.
 *
 * Renders nothing when there is nothing the user is missing.
 */

import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { emit, useChatStore, usePermissionStore, useProjectDomainStore } from '../../stores';
import { selectUnseenRequests } from '../../stores/permissionStore';
import type { PermissionRequest } from '../../../shared/types';
import { LockIcon } from '../icons';
import { Z_INDEX } from '../../constants/zIndex';

/** Short description of what is being asked, preferring the provider's own sentence. */
function requestSummary(request: PermissionRequest): string {
  if (request.title) return request.title;
  if (request.kind === 'write-access') return 'Allow writes for this conversation';
  return request.preview || request.toolName;
}

function RequestRow({
  request,
  projectName,
  onSelect,
}: {
  request: PermissionRequest;
  projectName: string;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left px-3 py-2 hover:bg-surface-3 transition-colors"
      >
        <div className="text-sm text-text-primary truncate">{requestSummary(request)}</div>
        <div className="text-xs text-text-muted mt-0.5 truncate">{projectName}</div>
      </button>
    </li>
  );
}

export function PendingRequestsBadge() {
  const viewedSessionId = useChatStore((state) => state.viewedSessionId);
  const unseenRequests = usePermissionStore(
    useShallow((state) => selectUnseenRequests(state, viewedSessionId)),
  );
  const { projects, currentProjectId } = useProjectDomainStore(
    useShallow((state) => ({ projects: state.projects, currentProjectId: state.currentProjectId })),
  );

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close rather than linger over a stale list once every request is answered.
  useEffect(() => {
    if (unseenRequests.length === 0) setOpen(false);
  }, [unseenRequests.length]);

  if (unseenRequests.length === 0) return null;

  const projectNameFor = (projectId: string) =>
    projects.find((project) => project.id === projectId)?.name ?? 'Another project';

  const handleSelect = (request: PermissionRequest) => {
    setOpen(false);
    const target = request.chatSessionId ? { chatSessionId: request.chatSessionId } : {};

    if (request.projectId !== currentProjectId) {
      emit({ type: 'switch-project', payload: { projectId: request.projectId, then: target } });
      return;
    }

    if (request.chatSessionId) {
      emit({ type: 'navigate-to-view', payload: target });
    }
  };

  const label = `${unseenRequests.length} waiting`;

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((previous) => !previous)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
          open
            ? 'bg-warning/20 text-warning'
            : 'bg-warning/10 text-warning hover:bg-warning/20'
        }`}
        aria-label={`${unseenRequests.length} permission ${unseenRequests.length === 1 ? 'request' : 'requests'} waiting for you`}
        aria-expanded={open}
      >
        <LockIcon className="w-3.5 h-3.5" />
        <span>{label}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-80 bg-surface-elevated rounded-lg border border-border-subtle shadow-lg overflow-hidden"
          style={{ zIndex: Z_INDEX.dropdown }}
          role="dialog"
          aria-label="Pending requests"
        >
          <div className="px-3 py-2 border-b border-border-subtle">
            <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Waiting for you
            </div>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {unseenRequests.map((request) => (
              <RequestRow
                key={request.requestId}
                request={request}
                projectName={projectNameFor(request.projectId)}
                onSelect={() => handleSelect(request)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
