import { permissionEndpoints } from '../../../shared/ipc/permissionEndpoints';

export const PermissionSchemas = {
  respond: permissionEndpoints.respond.params,
  list: permissionEndpoints.list.params,
  revoke: permissionEndpoints.revoke.params,
  revokeAll: permissionEndpoints.revokeAll.params,
};
