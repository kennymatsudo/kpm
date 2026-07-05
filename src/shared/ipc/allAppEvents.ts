/**
 * Aggregate of every domain event registry, flattened under a `domain.key`
 * prefix so tooling (the channel-registration completeness test) can walk
 * one object instead of importing each `*Events.ts` file individually. Not
 * used by main/preload runtime code — they import their own domain registry
 * directly (`chatEvents`, `reviewEvents`, ...) for the tighter, purpose-built
 * type each one provides.
 */

import type { EventDefinition } from './appEvents';
import { chatEvents } from './chatEvents';
import { reviewEvents } from './reviewEvents';
import { devSessionEvents } from './devSessionEvents';
import { agentSessionEvents } from './agentSessionEvents';
import { usageEvents } from './usageEvents';
import { permissionEvents } from './permissionEvents';
import { terminalEvents } from './terminalEvents';
import { briefingEvents } from './briefingEvents';
import { menuEvents } from './menuEvents';
import { notificationEvents } from './notificationEvents';
import { planEvents } from './planEvents';
import { repoEvents } from './repoEvents';
import { fileExplorerEvents } from './fileExplorerEvents';
import { trackerEvents } from './trackerEvents';
import { customPromptEvents } from './customPromptEvents';
import { onboardingEvents } from './onboardingEvents';
import { scheduledLoopEvents } from './scheduledLoopEvents';
import { toolLogEvents } from './toolLogEvents';

const domainRegistries = {
  chat: chatEvents,
  review: reviewEvents,
  devSession: devSessionEvents,
  agentSession: agentSessionEvents,
  usage: usageEvents,
  permission: permissionEvents,
  terminal: terminalEvents,
  briefing: briefingEvents,
  menu: menuEvents,
  notification: notificationEvents,
  plan: planEvents,
  repo: repoEvents,
  fileExplorer: fileExplorerEvents,
  tracker: trackerEvents,
  customPrompt: customPromptEvents,
  onboarding: onboardingEvents,
  scheduledLoop: scheduledLoopEvents,
  toolLog: toolLogEvents,
} satisfies Record<string, Record<string, EventDefinition>>;

/**
 * Flat `"domain.key"` -> channel string, covering every registered
 * main->renderer push event across all domains.
 */
export const allAppEventChannels: Record<string, string> = Object.fromEntries(
  Object.entries(domainRegistries).flatMap(([domain, registry]) =>
    Object.entries(registry as Record<string, EventDefinition>).map(
      ([key, definition]) => [`${domain}.${key}`, definition.channel] as const
    )
  )
);
