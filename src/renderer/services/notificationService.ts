import type { AppNotification } from '../../shared/types';

export function subscribeToNotifications(callback: (notification: AppNotification) => void): () => void {
  return window.api.notifications.onNew(callback);
}
