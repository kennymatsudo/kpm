/**
 * Repo domain event registry (main -> renderer push events).
 *
 * Covers `repo:branch-changed`, broadcast from `RepoWatcherService` on
 * `fs.watch` of `.git/HEAD`. Not an invoke endpoint — see `repoEndpoints.ts`
 * for the invoke surface.
 */

import { payloadOf, type EventDefinition } from './appEvents';

export interface RepoBranchChangedEventData {
  repoId: string;
  repoPath: string;
  branch: string | null;
}

export const repoEvents = {
  branchChanged: { channel: 'repo:branch-changed', payload: payloadOf<RepoBranchChangedEventData>() },
} satisfies Record<string, EventDefinition>;

export type RepoEvents = typeof repoEvents;
export type RepoEventName = keyof RepoEvents;
