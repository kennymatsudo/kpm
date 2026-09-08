/**
 * Cross-project activity IPC handler.
 *
 * A plain read of in-memory counts — nothing here can fail, so the snapshot is
 * returned raw rather than wrapped in a pass/fail envelope. Live updates ride
 * the `activity:changed` broadcast instead (see `activityEvents.ts`); this
 * endpoint exists so a freshly mounted renderer doesn't have to wait for the
 * next change to learn what is already running.
 */

import { activityEndpoints, type ActivityEndpointName } from '../../../shared/ipc/activityEndpoints';
import type { HandlerFor } from '../../../shared/ipc/endpoints';
import { bindRegistryHandlers } from '../validation/utils';
import type { ActivityService } from '../../services/core/ActivityService';

/**
 * One handler per `activityEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type ActivityHandlers = { [K in ActivityEndpointName]: HandlerFor<typeof activityEndpoints, K> };

function buildActivityHandlers(activityService: ActivityService): ActivityHandlers {
  return {
    snapshot: () => activityService.snapshot(),
  };
}

export function registerActivityHandlers(activityService: ActivityService): void {
  bindRegistryHandlers(activityEndpoints, buildActivityHandlers(activityService));
}
