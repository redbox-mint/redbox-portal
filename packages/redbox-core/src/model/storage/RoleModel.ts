import type { AuthorizationRoleStatus, ProtectedRoleKind, RoleContextType } from '../../authorization';
import { BrandingModel } from './BrandingModel';
import type { RoleTemplateModel } from './RoleTemplateModel';
import { UserModel } from './UserModel';

export class RoleModel {
  id = '';
  name = '';
  branding: BrandingModel = new BrandingModel();
  users: UserModel[] = [];
  key?: string;
  identityKey?: string;
  displayName?: string;
  description?: string;
  contextType?: RoleContextType;
  template?: RoleTemplateModel;
  templateRevision?: number;
  protectedKind?: ProtectedRoleKind;
  status?: AuthorizationRoleStatus;
  version?: number;
  createdBy?: string;
  updatedBy?: string;
}
