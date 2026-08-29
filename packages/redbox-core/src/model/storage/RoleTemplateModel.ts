import type { AuthorizationRoleStatus, ProtectedRoleKind } from '../../authorization';

export class RoleTemplateModel {
  id = '';
  key = '';
  displayName = '';
  description = '';
  currentRevision = 1;
  protectedKind: ProtectedRoleKind = 'none';
  status: AuthorizationRoleStatus = 'active';
  version = 1;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
