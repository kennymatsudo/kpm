/**
 * Notification domain event registry (main -> renderer push events).
 *
 * Covers `notification:new`, broadcast from `NotificationService` for any
 * user-visible system notification. Not an invoke endpoint — notifications
 * have no invoke surface.
 */

import { payloadOf, type EventDefinition } from './appEvents';
import type { AppNotification } from '../types';

export const notificationEvents = {
  new: { channel: 'notification:new', payload: payloadOf<AppNotification>() },
} satisfies Record<string, EventDefinition>;

export type NotificationEvents = typeof notificationEvents;
export type NotificationEventName = keyof NotificationEvents;
