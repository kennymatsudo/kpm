/**
 * Briefing domain event registry (main -> renderer push events).
 *
 * Covers `briefing:chunk`, streamed from `handlers/briefing.ts` during
 * Stage 2 synthesis. Not an invoke endpoint — see `briefingEndpoints.ts` for
 * the invoke surface. The channel was previously hand-declared inline on
 * `IPC_CHANNELS.briefing` in `shared/ipcChannels.ts`; this registry is now
 * its single owner.
 */

import { payloadOf, type EventDefinition } from './appEvents';

export interface BriefingChunkEventData {
  projectId: string;
  delta: string;
}

export const briefingEvents = {
  chunk: { channel: 'briefing:chunk', payload: payloadOf<BriefingChunkEventData>() },
} satisfies Record<string, EventDefinition>;

export type BriefingEvents = typeof briefingEvents;
export type BriefingEventName = keyof BriefingEvents;
