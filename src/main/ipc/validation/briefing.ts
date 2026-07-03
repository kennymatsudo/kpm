/**
 * Briefing Validation Schemas
 */

import { briefingEndpoints } from '../../../shared/ipc/briefingEndpoints';

export const BriefingSchemas = {
  generate: briefingEndpoints.generate.params,
  get: briefingEndpoints.get.params,
};
