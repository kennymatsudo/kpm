/**
 * Tracker domain event registry (main -> renderer push events).
 *
 * Covers `tracker:import:progress`/`tracker:sync:progress`, streamed from
 * `handlers/tracker.ts`'s `import.*`/`sync.preview` endpoint handlers during
 * a long-running Jira/Linear import or sync. Not invoke endpoints — see
 * `trackerEndpoints.ts` for the invoke surface.
 */

import { payloadOf, type EventDefinition } from './appEvents';
import type { TrackerProgressCallback } from '../types';

/** Mirrors the single parameter of `TrackerProgressCallback` (`shared/types.ts`). */
export type TrackerImportProgressEventData = Parameters<TrackerProgressCallback>[0];

export interface TrackerSyncProgressEventData {
  projectId: string;
  associationId: string;
  phase: string;
  current: number;
  total: number;
}

export const trackerEvents = {
  importProgress: { channel: 'tracker:import:progress', payload: payloadOf<TrackerImportProgressEventData>() },
  syncProgress: { channel: 'tracker:sync:progress', payload: payloadOf<TrackerSyncProgressEventData>() },
} satisfies Record<string, EventDefinition>;

export type TrackerEvents = typeof trackerEvents;
export type TrackerEventName = keyof TrackerEvents;
