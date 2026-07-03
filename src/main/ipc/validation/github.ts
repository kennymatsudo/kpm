/**
 * GitHub IPC Validation Schemas
 */

import { githubEndpoints } from '../../../shared/ipc/githubEndpoints';

export const GitHubSchemas = {
  checkAuth: githubEndpoints.checkAuth.params,
  createPr: githubEndpoints.createPr.params,
  getPrStatus: githubEndpoints.getPrStatus.params,
  getPrComments: githubEndpoints.getPrComments.params,
  buildPrContext: githubEndpoints.buildPrContext.params,
  generatePrContent: githubEndpoints.generatePrContent.params,
  buildAddressCommentsContext: githubEndpoints.buildAddressCommentsContext.params,
  detectAndLinkPr: githubEndpoints.detectAndLinkPr.params,
  linkPr: githubEndpoints.linkPr.params,
  linkPrToItem: githubEndpoints.linkPrToItem.params,
};
