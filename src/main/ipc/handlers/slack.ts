/**
 * Slack Triage IPC Handlers
 *
 * Handles Slack channel link management and triage operations.
 */

import { slackEndpoints, type SlackEndpointName } from '../../../shared/ipc/slackEndpoints';
import type { EndpointPayload } from '../../../shared/ipc/endpoints';
import type { SlackTriageService } from '../../services/core/SlackTriageService';
import { toIpcResponse, toIpcResponseAsync } from '../response';
import { unwrapOrThrow } from '../../services/result';
import { bindRegistryHandlers } from '../validation/utils';

type SlackHandler<K extends SlackEndpointName> = (
  params: EndpointPayload<(typeof slackEndpoints)[K]>
) => unknown;

/**
 * One handler per `slackEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 * Response shapes vary per endpoint (raw value, unwrapOrThrow, toIpcResponse)
 * so this binds directly to `ipcMain.handle` rather than going through
 * `createRegistryIpcHandlers`, which would force a uniform `{success, ...}`
 * envelope onto every entry.
 */
type SlackHandlers = { [K in SlackEndpointName]: SlackHandler<K> };

function buildSlackHandlers(slackTriageService: SlackTriageService): SlackHandlers {
  return {
    'availability.get': async () => unwrapOrThrow(await slackTriageService.getAvailability()),

    'links.list': ({ projectId }) => slackTriageService.listLinks(projectId),

    'links.create': async ({ projectId, channelId, channelName }) =>
      unwrapOrThrow(await slackTriageService.createLink(projectId, channelId, channelName)),

    'links.delete': ({ linkId }) => toIpcResponse(slackTriageService.deleteLink(linkId)),

    'triage.trigger': async ({ projectId, channelLinkId }) =>
      unwrapOrThrow(await slackTriageService.triggerTriage(projectId, channelLinkId)),

    'triage.getPending': ({ projectId }) => slackTriageService.getPending(projectId),

    'triage.getAll': ({ projectId }) => slackTriageService.getAll(projectId),

    'triage.countPending': ({ projectId }) => slackTriageService.countPending(projectId),

    'triage.approve': ({ itemId }) => toIpcResponse(slackTriageService.approveItem(itemId)),

    'triage.edit': ({ itemId, suggestedAction }) =>
      toIpcResponse(slackTriageService.editItem(itemId, suggestedAction)),

    'triage.dismiss': ({ itemId }) => toIpcResponse(slackTriageService.dismissItem(itemId)),

    'triage.restore': ({ itemId }) => toIpcResponse(slackTriageService.restoreItem(itemId)),

    'triage.execute': ({ itemId }) => toIpcResponseAsync(slackTriageService.executeItem(itemId)),
  };
}

export function registerSlackHandlers(slackTriageService: SlackTriageService): void {
  const handlers = buildSlackHandlers(slackTriageService);
  bindRegistryHandlers(slackEndpoints, handlers);
}
