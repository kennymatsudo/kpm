/**
 * Notification Badge
 *
 * Topbar bell for `AppNotification`s pushed from the main process. Kind
 * agnostic — today's only source is scheduled loops, but any future event
 * (tracker sync, PR review, etc.) that reaches `notificationStore` via
 * `notification:new` shows up here without further wiring.
 *
 * Notifications are global while the stores they resolve against hold one
 * project, so a row for another project names that project and switches to it
 * before navigating. Clicking used to be a silent no-op in that case.
 */

import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  useNotificationStore,
  selectUnreadCount,
  type NotificationRecord,
} from '../../stores/notificationStore';
import { emit, useDevSessionsStore, usePlanDomainStore, useProjectDomainStore } from '../../stores';
import type { NavigateToViewEvent } from '../../stores/storeEvents';
import type { AppNotification, NotificationSeverity } from '../../../shared/types';
import { BellIcon, CloseIcon } from '../icons';
import { Z_INDEX } from '../../constants/zIndex';
import { formatRelativeTime } from '../../utils/relativeTime';
import { openExternalUrl } from '../../services/shellService';

const severityDotClass: Record<NotificationSeverity, string> = {
  info: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-danger',
};

/**
 * In-app navigation payload for a link, or null when the link points somewhere
 * external (or nowhere). Board sessions and plan items live in the open
 * project's stores; a PR or ticket URL comes off a record in those same stores,
 * which is why only the first two survive a project switch.
 */
function navigationPayloadFor(
  link: NonNullable<AppNotification['link']>,
): NavigateToViewEvent['payload'] | null {
  switch (link.kind) {
    case 'dev_session':
      return { view: 'planning', boardSessionId: link.id };
    case 'plan_item':
      return { view: 'planning', planItemId: link.id };
    case 'session':
    case 'pr':
    case 'external':
      return null;
  }
}

/**
 * Opens whatever a notification points at, switching projects first when the
 * notification belongs to one that isn't open — the target only exists in the
 * stores once its project has loaded, which is why the switch carries the
 * navigation as a follow-up rather than emitting it here.
 *
 * External links (a PR on GitHub, a ticket in the tracker) still resolve
 * against the open project only; they read a URL off a session or plan item
 * that a switch would have to load first, and no notification kind produces
 * one for a project other than the open one today.
 */
function openNotificationLink(
  link: NonNullable<AppNotification['link']>,
  notificationProjectId: string | undefined,
): void {
  const navigation = navigationPayloadFor(link);

  if (navigation) {
    const currentProjectId = useProjectDomainStore.getState().currentProjectId;
    if (notificationProjectId && notificationProjectId !== currentProjectId) {
      emit({
        type: 'switch-project',
        payload: { projectId: notificationProjectId, then: navigation },
      });
      return;
    }
    emit({ type: 'navigate-to-view', payload: navigation });
    return;
  }

  switch (link.kind) {
    case 'session': {
      const session = useDevSessionsStore.getState().sessions.find((s) => s.id === link.id);
      if (session?.pr_url) openExternalUrl(session.pr_url);
      break;
    }
    case 'pr': {
      const [repoId, prNumberText] = link.id.split('#');
      const prNumber = Number(prNumberText);
      const session = useDevSessionsStore
        .getState()
        .sessions.find((s) => s.repo_id === repoId && s.pr_number === prNumber);
      if (session?.pr_url) openExternalUrl(session.pr_url);
      break;
    }
    case 'external': {
      const item = usePlanDomainStore.getState().planItems.find((i) => i.external_key === link.id);
      if (item?.external_url) openExternalUrl(item.external_url);
      break;
    }
    // Both are handled above by `navigationPayloadFor`.
    case 'dev_session':
    case 'plan_item':
      break;
  }
}

function NotificationRow({
  notification,
  otherProjectName,
  onSelect,
  onDismiss,
}: {
  notification: NotificationRecord;
  /** Project name when the notification is from a project that isn't open. */
  otherProjectName: string | null;
  onSelect: () => void;
  onDismiss: () => void;
}) {
  return (
    <li className="flex items-start gap-2 px-3 py-2 hover:bg-surface-3 transition-colors">
      <span
        className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          notification.read ? 'bg-transparent' : severityDotClass[notification.severity]
        }`}
        aria-hidden="true"
      />
      <button type="button" onClick={onSelect} className="flex-1 min-w-0 text-left">
        <div className={`text-sm truncate ${notification.read ? 'text-text-secondary' : 'text-text-primary font-medium'}`}>
          {notification.title}
        </div>
        {notification.body && (
          <div className="text-xs text-text-muted mt-0.5 line-clamp-2">{notification.body}</div>
        )}
        <div className="text-tiny text-text-muted mt-1">
          {otherProjectName ? `${otherProjectName} · ` : ''}
          {formatRelativeTime(notification.at)}
        </div>
      </button>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-4 transition-colors"
        aria-label={`Dismiss ${notification.title}`}
      >
        <CloseIcon className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

export function NotificationBadge() {
  const notifications = useNotificationStore((state) => state.notifications);
  const { projects, currentProjectId } = useProjectDomainStore(
    useShallow((state) => ({ projects: state.projects, currentProjectId: state.currentProjectId })),
  );
  const unreadCount = useNotificationStore(useShallow(selectUnreadCount));
  const { markRead, markAllRead, dismiss } = useNotificationStore(
    useShallow((state) => ({
      markRead: state.markRead,
      markAllRead: state.markAllRead,
      dismiss: state.dismiss,
    }))
  );
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Only name the project when it isn't the open one — labelling every row
  // with the project the user is already looking at is noise.
  const otherProjectNameFor = (projectId: string | undefined): string | null => {
    if (!projectId || projectId === currentProjectId) return null;
    return projects.find((project) => project.id === projectId)?.name ?? 'Another project';
  };

  const handleSelect = (notification: NotificationRecord) => {
    markRead(notification.id);
    if (notification.link) openNotificationLink(notification.link, notification.projectId);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((p) => !p)}
        className={`relative p-1.5 rounded-md transition-colors ${
          open ? 'bg-surface-3 text-text-primary' : 'text-text-muted hover:text-text-primary hover:bg-surface-3'
        }`}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'Notifications'}
        aria-expanded={open}
      >
        <BellIcon className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-tiny font-semibold bg-accent text-white rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-80 bg-surface-elevated rounded-lg border border-border-subtle shadow-lg overflow-hidden"
          style={{ zIndex: Z_INDEX.dropdown }}
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
            <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">Notifications</div>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="text-tiny text-accent hover:text-accent-hover transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-text-muted">No notifications yet.</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  otherProjectName={otherProjectNameFor(notification.projectId)}
                  onSelect={() => handleSelect(notification)}
                  onDismiss={() => dismiss(notification.id)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
