/**
 * Activity domain endpoint registry — cross-project "what is running right now".
 *
 * Only one window is ever open and it shows one project at a time, so without
 * this the user has no way to tell that another project has a chat mid-turn, a
 * board agent working, or an agent blocked waiting on them. Every other
 * per-project query in the app takes a `projectId` and answers for that
 * project; this one deliberately answers for all of them at once.
 *
 * Counts only — nothing here identifies a session. Anything the user needs to
 * act on arrives as a notification (`notificationEvents`) or a permission
 * request (`permissionEvents`), both of which already carry their own ids.
 */

import { resultOf, type EndpointDefinition } from './endpoints';

/** Live work counts for a single project. A project with no activity is omitted. */
export interface ProjectActivity {
  projectId: string;
  /** Chat sessions mid-turn. */
  chatTurns: number;
  /** Board agents starting or working. */
  agentsWorking: number;
  /** Board agents blocked on the user. */
  agentsAwaitingInput: number;
  /** Running shells in the terminal panel. */
  terminals: number;
}

export type ActivitySnapshot = ProjectActivity[];

export const activityEndpoints = {
  snapshot: {
    channel: 'activity:snapshot',
    params: null,
    result: resultOf<ActivitySnapshot>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type ActivityEndpoints = typeof activityEndpoints;
export type ActivityEndpointName = keyof ActivityEndpoints;
