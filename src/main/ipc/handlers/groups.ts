/**
 * Group IPC Handlers
 *
 * Handles all group-related IPC calls from the renderer.
 * Groups are visual containers (Figma-style frames) for organizing plan items.
 */

import { ipcMain } from 'electron';
import type { GroupService } from '../../services/core/GroupService';
import type { IGroupRepository } from '../../db/interfaces';
import { toIpcResponse } from '../response';
import { success, failure } from '../../services/result';
import { GroupSchemas } from '../validation/group';
import { IPC_CHANNELS } from '../channels';

export function registerGroupHandlers(groupService: GroupService, groups: IGroupRepository): void {
  // ─────────────────────────────────────────────────────────────────────────
  // CRUD Operations
  // ─────────────────────────────────────────────────────────────────────────

  // List groups for a project
  ipcMain.handle(IPC_CHANNELS.group.list, (_event, params: unknown) => {
    const { projectId } = GroupSchemas.list.parse(params);
    return groups.getByProjectId(projectId);
  });

  // Get a single group
  ipcMain.handle(IPC_CHANNELS.group.get, (_event, params: unknown) => {
    const { id } = GroupSchemas.get.parse(params);
    return groups.getById(id);
  });

  // Create a new group
  ipcMain.handle(IPC_CHANNELS.group.create, (_event, params: unknown) => {
    const { projectId, name, color, position_x, position_y, width, height } = GroupSchemas.create.parse(params);
    return groups.create({
      project_id: projectId,
      name,
      color,
      position_x,
      position_y,
      width,
      height,
      is_collapsed: false,
    });
  });

  // Update a group
  ipcMain.handle(IPC_CHANNELS.group.update, (_event, params: unknown) => {
    const { id, updates } = GroupSchemas.update.parse(params);
    if (!groups.getById(id)) {
      return toIpcResponse(failure(`Group not found: ${id}`));
    }
    groups.update(id, updates);
    return toIpcResponse(success(undefined));
  });

  // Delete a group
  ipcMain.handle(IPC_CHANNELS.group.delete, (_event, params: unknown) => {
    const { id } = GroupSchemas.delete.parse(params);
    if (!groups.getById(id)) {
      return toIpcResponse(failure(`Group not found: ${id}`));
    }
    groups.delete(id);
    return toIpcResponse(success(undefined));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Position & Size Operations
  // ─────────────────────────────────────────────────────────────────────────

  // Update group position
  ipcMain.handle(IPC_CHANNELS.group.updatePosition, (_event, params: unknown) => {
    const { id, x, y } = GroupSchemas.updatePosition.parse(params);
    if (!groups.getById(id)) {
      return toIpcResponse(failure(`Group not found: ${id}`));
    }
    groups.updatePosition(id, x, y);
    return toIpcResponse(success(undefined));
  });

  // Update group size
  ipcMain.handle(IPC_CHANNELS.group.updateSize, (_event, params: unknown) => {
    const { id, width, height } = GroupSchemas.updateSize.parse(params);
    if (!groups.getById(id)) {
      return toIpcResponse(failure(`Group not found: ${id}`));
    }
    groups.updateSize(id, width, height);
    return toIpcResponse(success(undefined));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Item Assignment
  // ─────────────────────────────────────────────────────────────────────────

  // Assign item to group (or unassign with null)
  ipcMain.handle(IPC_CHANNELS.group.assignItem, (_event, params: unknown) => {
    const { itemId, groupId } = GroupSchemas.assignItem.parse(params);
    return toIpcResponse(groupService.assignItem(itemId, groupId));
  });
}
