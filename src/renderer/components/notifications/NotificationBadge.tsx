/**
 * Notification Badge
 *
 * Topbar bell for `AppNotification`s pushed from the main process. Kind
 * agnostic — today's only source is scheduled loops, but any future event
 * (tracker sync, PR review, etc.) that reaches `notificationStore` via
 * `notification:new` shows up here without further wiring.
 */

import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  useNotificationStore,
  selectUnreadCount,
  type NotificationRecord,
} from '../../stores/notificationStore';
import { emit, useDevSessionsStore, usePlanDomainStore } from '../../stores';
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
 * Resolves a notification's link against whatever's already loaded in the
 * project/session stores and takes the corresponding action. Kinds with no
 * resolvable target today (e.g. a 'pr' link when the PR was never linked to a
 * session, or an 'external' ticket not imported into the current project) are
 * silent no-ops — there is nothing to navigate to.
 */
function navigateToNotificationLink(link: NonNullable<AppNotification['link']>): void {
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
    case 'plan_item': {
      emit({ type: 'navigate-to-view', payload: { view: 'planning', planItemId: link.id } });
      break;
    }
    case 'external': {
      const item = usePlanDomainStore.getState().planItems.find((i) => i.external_key === link.id);
      if (item?.external_url) openExternalUrl(item.external_url);
      break;
    }
  }
}

function NotificationRow({
  notification,
  onSelect,
  onDismiss,
}: {
  notification: NotificationRecord;
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
        <div className="text-tiny text-text-muted mt-1">{formatRelativeTime(notification.at)}</div>
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

  const handleSelect = (notification: NotificationRecord) => {
    markRead(notification.id);
    if (notification.link) navigateToNotificationLink(notification.link);
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
