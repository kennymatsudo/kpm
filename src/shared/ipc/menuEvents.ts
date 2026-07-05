/**
 * Application menu event registry (main -> renderer push events).
 *
 * Covers `menu:*` channels sent from `bootstrap/menu.ts`'s native menu
 * click handlers. Not invoke endpoints — the app menu has no invoke surface.
 */

import { payloadOf, type EventDefinition } from './appEvents';

export interface MenuOpenProjectEventData {
  projectId: string;
}

export const menuEvents = {
  newProject: { channel: 'menu:new-project', payload: payloadOf<undefined>() },
  openProject: { channel: 'menu:open-project', payload: payloadOf<MenuOpenProjectEventData>() },
  closeContext: { channel: 'menu:close-context', payload: payloadOf<undefined>() },
} satisfies Record<string, EventDefinition>;

export type MenuEvents = typeof menuEvents;
export type MenuEventName = keyof MenuEvents;
