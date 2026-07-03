/**
 * Dev Session and Worktree Validation Schemas
 */

import { worktreeEndpoints } from '../../../shared/ipc/worktreeEndpoints';
import { devSessionEndpoints } from '../../../shared/ipc/devSessionEndpoints';

// =============================================================================
// Dev Session Schemas
// =============================================================================

export const DevSessionSchemas = {
  getByProject: devSessionEndpoints.getByProject.params,
  getByProjectWithPlanItems: devSessionEndpoints.getByProjectWithPlanItems.params,
  getActive: devSessionEndpoints.getActive.params,
  get: devSessionEndpoints.get.params,
  hasActive: devSessionEndpoints.hasActive.params,
  openEditor: devSessionEndpoints.openEditor.params,
  updateStatus: devSessionEndpoints.updateStatus.params,
  delete: devSessionEndpoints.delete.params,
  destroy: devSessionEndpoints.destroy.params,
  checkDirty: devSessionEndpoints.checkDirty.params,
  getDiff: devSessionEndpoints.getDiff.params,
  getCommitsAhead: devSessionEndpoints.getCommitsAhead.params,
  updateName: devSessionEndpoints.updateName.params,
  getMergeOrder: devSessionEndpoints.getMergeOrder.params,
  updateMergeOrder: devSessionEndpoints.updateMergeOrder.params,
};

// =============================================================================
// Worktree Schemas
// =============================================================================

export const WorktreeSchemas = {
  getByProject: worktreeEndpoints.getByProject.params,
  getByPlanItem: worktreeEndpoints.getByPlanItem.params,
  openEditor: worktreeEndpoints.openEditor.params,
  getStatus: worktreeEndpoints.getStatus.params,
  delete: worktreeEndpoints.delete.params,
  push: worktreeEndpoints.push.params,
  destroy: worktreeEndpoints.destroy.params,
};
