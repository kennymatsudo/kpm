/**
 * Generic notification store.
 *
 * Kind-agnostic registry of `AppNotification`s pushed from the main process
 * (loop findings today; PR/ticket/tracker events in the future all funnel
 * through the same `notification:new` broadcast). A topbar badge reads this
 * store to show an unread indicator and a dropdown of recent notifications.
 *
 * Not project-scoped — notifications may reference any project, and the badge
 * is a global app affordance. Ephemeral: nothing here is persisted to disk, so
 * the list resets on app restart (matches `NotificationService`, which does
 * not persist either).
 */

import { create } from 'zustand';
import type { AppNotification } from '../../shared/types';
import { subscribeToNotifications } from '../services/notificationService';

export interface NotificationRecord extends AppNotification {
  read: boolean;
}

interface NotificationState {
  notifications: NotificationRecord[];
  add: (notification: AppNotification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

// Caps memory growth over a long-running session; oldest notifications fall off.
const MAX_NOTIFICATIONS = 50;

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],

  add: (notification) => {
    set((state) => ({
      notifications: [{ ...notification, read: false }, ...state.notifications].slice(0, MAX_NOTIFICATIONS),
    }));
  },

  markRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  },

  markAllRead: () => {
    set((state) => ({ notifications: state.notifications.map((n) => ({ ...n, read: true })) }));
  },

  dismiss: (id) => {
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }));
  },

  clear: () => set({ notifications: [] }),
}));

export function selectUnreadCount(state: NotificationState): number {
  return state.notifications.reduce((count, n) => (n.read ? count : count + 1), 0);
}

/**
 * Initialize once at app startup. Subscribes to the main process's
 * `notification:new` broadcast and routes events into this store. Returns an
 * unsubscribe.
 */
export function initNotificationListener(): () => void {
  return subscribeToNotifications((notification) => {
    useNotificationStore.getState().add(notification);
  });
}
