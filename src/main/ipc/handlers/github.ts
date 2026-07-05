/**
 * GitHub IPC Handlers
 *
 * Bridges renderer to GitHubService for PR management operations.
 */

import type { createGitHubService } from '../../services/repo/GitHubService';
import { unwrapOrThrow } from '../../services/result';
import { githubEndpoints, type GitHubEndpointName } from '../../../shared/ipc/githubEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import { createRegistryIpcHandlers } from '../validation/utils';

type GitHubService = ReturnType<typeof createGitHubService>;

/**
 * One handler per `githubEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type GitHubHandlers = { [K in GitHubEndpointName]: UnwrappedHandlerFor<typeof githubEndpoints, K> };

function buildGitHubHandlers(gitHubService: GitHubService): GitHubHandlers {
  return {
    checkAuth: async ({ sessionId }) => {
      const result = await gitHubService.checkAuth(sessionId);
      return unwrapOrThrow(result);
    },

    createPr: async ({ sessionId, title, body, draft }) => {
      return unwrapOrThrow(await gitHubService.createPr(sessionId, title, body, draft));
    },

    getPrStatus: async ({ sessionId }) => {
      const status = unwrapOrThrow(await gitHubService.getPrStatus(sessionId));
      return { status };
    },

    getPrComments: async ({ sessionId }) => {
      const comments = unwrapOrThrow(await gitHubService.getPrComments(sessionId));
      return { comments };
    },

    buildPrContext: async ({ sessionId }) => {
      return unwrapOrThrow(await gitHubService.buildPrContext(sessionId));
    },

    generatePrContent: async ({ sessionId, rawTitle, rawBody, prTemplate, diff, commitLog, featureContextPath }) => {
      return unwrapOrThrow(await gitHubService.generatePrContent(sessionId, rawTitle, rawBody, prTemplate, diff, commitLog, featureContextPath));
    },

    buildAddressCommentsContext: async ({ sessionId }) => {
      const context = unwrapOrThrow(await gitHubService.buildAddressCommentsContext(sessionId));
      return { context };
    },

    detectAndLinkPr: async ({ sessionId }) => {
      const status = unwrapOrThrow(await gitHubService.detectAndLinkPr(sessionId));
      return { status };
    },

    linkPr: async ({ sessionId, prIdentifier }) => {
      return unwrapOrThrow(await gitHubService.linkPr(sessionId, prIdentifier));
    },

    linkPrToItem: async ({ planItemId, repoId, prIdentifier }) => {
      return unwrapOrThrow(await gitHubService.linkPrToItem(planItemId, repoId, prIdentifier));
    },
  };
}

export function registerGitHubHandlers(gitHubService: GitHubService): void {
  createRegistryIpcHandlers(
    githubEndpoints,
    buildGitHubHandlers(gitHubService),
    'GitHub operation failed'
  );
}
