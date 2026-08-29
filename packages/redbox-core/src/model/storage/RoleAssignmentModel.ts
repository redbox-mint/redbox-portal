import type { RoleAssignmentSource, RoleAssignmentStatus } from '../../authorization';
import type { BrandingModel } from './BrandingModel';
import type { RoleModel } from './RoleModel';

export class RoleAssignmentModel {
  id = '';
  principalType: 'user' = 'user';
  principalId = '';
  role!: string | RoleModel;
  branding?: string | BrandingModel;
  source: RoleAssignmentSource = 'manual';
  sourceKey = '';
  status: RoleAssignmentStatus = 'active';
  sourcePresent = true;
  assignedBy = '';
  assignedAt!: string | Date;
  expiresAt?: string | Date;
  revokedBy?: string;
  revokedAt?: string | Date;
  suppressedBy?: string;
  suppressedAt?: string | Date;
  reason?: string;
  version = 1;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
