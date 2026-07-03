/**
 * Claude Usage Tracking Validation Schemas
 */

import { usageEndpoints } from '../../../shared/ipc/usageEndpoints';

export const UsageSchemas = {
  getProjectStats: usageEndpoints.getProjectStats.params,
  getGlobalStats: usageEndpoints.getGlobalStats.params,
  listEvents: usageEndpoints.listEvents.params,
  resetProject: usageEndpoints.resetProject.params,
};
