import { z } from 'zod';
import { uuid } from './shared';

const permissionAction = z.enum(['allow', 'deny', 'allow-always', 'allow-all-remaining']);

export const PermissionSchemas = {
  respond: z.object({
    requestId: uuid,
    projectId: uuid,
    action: permissionAction,
  }),

  list: z.object({
    projectId: uuid,
  }),

  revoke: z.object({
    id: uuid,
    projectId: uuid,
    cacheKey: z.string().min(1),
  }),

  revokeAll: z.object({
    projectId: uuid,
  }),
};
