/**
 * Slack Triage IPC Handlers
 *
 * Handles Slack channel link management and triage operations.
 */

import { ipcMain } from 'electron';
import type { SlackTriageService } from '../../services/core/SlackTriageService';
import { toIpcResponse, toIpcResponseAsync } from '../response';
import { unwrapOrThrow } from '../../services/result';
import { SlackSchemas } from '../validation/slack';
import { IPC_CHANNELS } from '../channels';

export function registerSlackHandlers(slackTriageService: SlackTriageService): void {
  ipcMain.handle(IPC_CHANNELS.slack.availability.get, async (_event, params: unknown) => {
    SlackSchemas.availability.parse(params);
    return unwrapOrThrow(await slackTriageService.getAvailability());
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Channel Links
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.slack.links.list, (_event, params: unknown) => {
    const { projectId } = SlackSchemas.listLinks.parse(params);
    return slackTriageService.listLinks(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.slack.links.create, async (_event, params: unknown) => {
    const { projectId, channelId, channelName } = SlackSchemas.createLink.parse(params);
    return unwrapOrThrow(await slackTriageService.createLink(projectId, channelId, channelName));
  });

  ipcMain.handle(IPC_CHANNELS.slack.links.delete, (_event, params: unknown) => {
    const { linkId } = SlackSchemas.deleteLink.parse(params);
    return toIpcResponse(slackTriageService.deleteLink(linkId));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Triage Operations
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.slack.triage.trigger, async (_event, params: unknown) => {
    const { projectId, channelLinkId } = SlackSchemas.triggerTriage.parse(params);
    return unwrapOrThrow(await slackTriageService.triggerTriage(projectId, channelLinkId));
  });

  ipcMain.handle(IPC_CHANNELS.slack.triage.getPending, (_event, params: unknown) => {
    const { projectId } = SlackSchemas.getPending.parse(params);
    return slackTriageService.getPending(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.slack.triage.getAll, (_event, params: unknown) => {
    const { projectId } = SlackSchemas.getAll.parse(params);
    return slackTriageService.getAll(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.slack.triage.countPending, (_event, params: unknown) => {
    const { projectId } = SlackSchemas.countPending.parse(params);
    return slackTriageService.countPending(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.slack.triage.approve, (_event, params: unknown) => {
    const { itemId } = SlackSchemas.approveItem.parse(params);
    return toIpcResponse(slackTriageService.approveItem(itemId));
  });

  ipcMain.handle(IPC_CHANNELS.slack.triage.edit, (_event, params: unknown) => {
    const { itemId, suggestedAction } = SlackSchemas.editItem.parse(params);
    return toIpcResponse(slackTriageService.editItem(itemId, suggestedAction));
  });

  ipcMain.handle(IPC_CHANNELS.slack.triage.dismiss, (_event, params: unknown) => {
    const { itemId } = SlackSchemas.dismissItem.parse(params);
    return toIpcResponse(slackTriageService.dismissItem(itemId));
  });

  ipcMain.handle(IPC_CHANNELS.slack.triage.restore, (_event, params: unknown) => {
    const { itemId } = SlackSchemas.restoreItem.parse(params);
    return toIpcResponse(slackTriageService.restoreItem(itemId));
  });

  ipcMain.handle(IPC_CHANNELS.slack.triage.execute, (_event, params: unknown) => {
    const { itemId } = SlackSchemas.executeItem.parse(params);
    return toIpcResponseAsync(slackTriageService.executeItem(itemId));
  });
}
