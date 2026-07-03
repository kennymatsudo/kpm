/**
 * Group IPC Handlers
 *
 * Handles all group-related IPC calls from the renderer.
 * Groups are visual containers (Figma-style frames) for organizing plan items.
 */

import { groupEndpoints, type GroupEndpointName } from '../../../shared/ipc/groupEndpoints';
import type { EndpointPayload } from '../../../shared/ipc/endpoints';
import type { GroupService } from '../../services/core/GroupService';
import type { IGroupRepository } from '../../db/interfaces';
import { toIpcResponse, type IpcResponse } from '../response';
import { success, failure } from '../../services/result';
import { bindRegistryHandlers } from '../validation/utils';

type GroupHandler<K extends GroupEndpointName> = (
  params: EndpointPayload<(typeof groupEndpoints)[K]>
) => unknown;

/** Returns a `Group not found` response if `id` doesn't resolve, else `undefined`. */
function groupNotFoundResponse(groups: IGroupRepository, id: string): IpcResponse<void> | undefined {
  if (groups.getById(id)) {
    return undefined;
  }
  return toIpcResponse(failure(`Group not found: ${id}`));
}

/**
 * One handler per `groupEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 * Response shapes vary per endpoint (raw value vs. toIpcResponse) so this
 * binds directly to `ipcMain.handle` rather than going through
 * `createRegistryIpcHandlers`, which would force a uniform `{success, ...}`
 * envelope onto every entry.
 */
type GroupHandlers = { [K in GroupEndpointName]: GroupHandler<K> };

function buildGroupHandlers(groupService: GroupService, groups: IGroupRepository): GroupHandlers {
  return {
    list: ({ projectId }) => groups.getByProjectId(projectId),

    get: ({ id }) => groups.getById(id),

    create: ({ projectId, name, color, position_x, position_y, width, height }) =>
      groups.create({
        project_id: projectId,
        name,
        color,
        position_x,
        position_y,
        width,
        height,
        is_collapsed: false,
      }),

    update: ({ id, updates }) => {
      const notFound = groupNotFoundResponse(groups, id);
      if (notFound) return notFound;
      groups.update(id, updates);
      return toIpcResponse(success(undefined));
    },

    delete: ({ id }) => {
      const notFound = groupNotFoundResponse(groups, id);
      if (notFound) return notFound;
      groups.delete(id);
      return toIpcResponse(success(undefined));
    },

    updatePosition: ({ id, x, y }) => {
      const notFound = groupNotFoundResponse(groups, id);
      if (notFound) return notFound;
      groups.updatePosition(id, x, y);
      return toIpcResponse(success(undefined));
    },

    updateSize: ({ id, width, height }) => {
      const notFound = groupNotFoundResponse(groups, id);
      if (notFound) return notFound;
      groups.updateSize(id, width, height);
      return toIpcResponse(success(undefined));
    },

    assignItem: ({ itemId, groupId }) => toIpcResponse(groupService.assignItem(itemId, groupId)),
  };
}

export function registerGroupHandlers(groupService: GroupService, groups: IGroupRepository): void {
  const handlers = buildGroupHandlers(groupService, groups);
  bindRegistryHandlers(groupEndpoints, handlers);
}
