import type { RoleScopeEffect } from '../../authorization';
import type { RoleModel } from './RoleModel';

export class RoleScopeOverrideModel {
  id = '';
  role!: string | RoleModel;
  scopeKey = '';
  effect: RoleScopeEffect = 'add';
  createdBy = '';
  reason?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
