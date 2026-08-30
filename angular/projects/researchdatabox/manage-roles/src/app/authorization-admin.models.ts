export type RolloutMode = 'legacy' | 'shadow' | 'enforce';
export type AuthorizationAuthMethod = 'anonymous' | 'session' | 'bearer' | 'internal';
export type ProtectedRoleKind = 'none' | 'guest' | 'brand-admin' | 'system-admin';
export type RoleStatus = 'active' | 'inactive';
export type ScopeRisk = 'read' | 'write' | 'admin' | 'system';
export type ScopeStatus = 'active' | 'deprecated' | 'orphaned';
export type ScopeSourceType = 'core' | 'hook';
export type AssignmentSource = 'manual' | 'onboarding' | 'migration' | 'external' | 'recovery';
export type AssignmentStatus = 'active' | 'revoked' | 'suppressed';
export type AssignmentExpiryFilter = 'expired' | 'unexpired' | 'never';
export type AuthorizationAuditOutcome = 'succeeded' | 'denied' | 'failed';
export type AuthorizationAuditActorType = 'user' | 'system-process' | 'operator';
export type AuthorizationAuditAuthMethod = 'session' | 'legacy-bearer' | 'internal' | 'operator';
export type AuthorizationAuditEventType =
  | 'authorization.bootstrap.invariants-checked'
  | 'authorization.migration.batch-applied'
  | 'assignment.created'
  | 'assignment.batch-applied'
  | 'assignment.expired'
  | 'assignment.noop'
  | 'assignment.reactivated'
  | 'assignment.revoked'
  | 'assignment.source-replaced'
  | 'assignment.suppressed'
  | 'assignment.unsuppressed'
  | 'audit.retention.completed'
  | 'authorization.config-exported'
  | 'authorization.config-imported'
  | 'role.cloned'
  | 'role.created'
  | 'role.deleted'
  | 'role.inactivated'
  | 'role.scopes-updated'
  | 'role.template-upgraded'
  | 'role.template-upgrade-batch-applied'
  | 'role.updated'
  | 'scope.adopted'
  | 'scope.catalog-reconciled'
  | 'scope.orphaned'
  | 'template.reconciled'
  | 'template.revision-published';
export type AuthorizationAuditTargetType =
  | 'authorization-audit'
  | 'authorization-config'
  | 'authorization-migration'
  | 'authorization-readiness'
  | 'authorization-scope'
  | 'role'
  | 'role-assignment'
  | 'role-scope-override'
  | 'role-template'
  | 'role-template-revision';

export interface AuthorizationProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  requestId: string;
}

export interface AuthorizationMe {
  brand?: {
    id: string;
    name: string;
  };
  rolloutMode: RolloutMode;
  principal: {
    category: 'anonymous' | 'authenticated' | 'system-admin' | 'legacy-bearer' | 'system-process';
    authMethod: AuthorizationAuthMethod;
    active: boolean;
    userId?: string;
  };
  roles: AuthorizationEffectiveRole[];
  scopeKeys: string[];
}

export interface AuthorizationEffectiveRole {
  id: string;
  key: string;
  displayName: string;
  contextType: 'brand' | 'system';
  brandId?: string;
  protectedKind: ProtectedRoleKind;
  implicit: boolean;
  assignmentCount?: number;
  assignmentsTruncated?: boolean;
  assignments?: AuthorizationEffectiveAssignmentEvidence[];
}

export interface AuthorizationEffectiveAssignmentEvidence {
  assignmentId: string;
  source: AssignmentSource;
  sourceKey: string;
  expiresAt?: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor?: string;
}

export interface ScopeCatalogPage extends CursorPage<AuthorizationScope> {
  generation: string;
}

export interface AuthorizationScope {
  key: string;
  namespace: string;
  label: string;
  description: string;
  risk: ScopeRisk;
  sourceType: ScopeSourceType;
  sourcePackage: string;
  sourceVersion: string;
  status: ScopeStatus;
  replacementKey?: string;
  metadataVersion: number;
}

export interface ScopeCatalogQuery {
  cursor?: string;
  limit?: number;
  search?: string;
  namespace?: string;
  risk?: ScopeRisk;
  sourceType?: ScopeSourceType;
  status?: ScopeStatus;
}

export interface AuthorizationTemplateRevisionSummary {
  revision: number;
  notes?: string;
  publishedBy: string;
  publishedAt: string;
}

export interface AuthorizationTemplateRevision extends AuthorizationTemplateRevisionSummary {
  templateKey: string;
  scopeKeys: string[];
}

export interface AuthorizationTemplate {
  key: string;
  displayName: string;
  description: string;
  currentRevision: number;
  protectedKind: ProtectedRoleKind;
  status: RoleStatus;
  version: number;
  revisions: AuthorizationTemplateRevisionSummary[];
  revisionsTruncated: boolean;
}

export interface TemplateCatalogQuery {
  cursor?: string;
  limit?: number;
  search?: string;
  protectedKind?: ProtectedRoleKind;
  status?: RoleStatus;
}

export interface RoleCatalogQuery {
  cursor?: string;
  limit?: number;
  search?: string;
  protectedKind?: ProtectedRoleKind;
  status?: RoleStatus;
  templateKey?: string;
}

export interface AuthorizationRoleSummary {
  id: string;
  key: string;
  displayName: string;
  description?: string;
  contextType: 'brand';
  brandId: string;
  protectedKind: ProtectedRoleKind;
  status: RoleStatus;
  templateKey?: string;
  templateRevision?: number;
  version: number;
}

export interface RoleScopeOverride {
  scopeKey: string;
  effect: 'add' | 'remove';
}

export interface AuthorizationRole extends Omit<AuthorizationRoleSummary, 'contextType' | 'brandId'> {
  contextType: 'brand' | 'system';
  brandId?: string;
  baseScopeKeys: string[];
  effectiveScopeKeys: string[];
  overrides: RoleScopeOverride[];
}

interface CreateRoleRequestBase {
  key: string;
  displayName: string;
  description?: string;
  reason?: string;
}

export type CreateRoleRequest = CreateRoleRequestBase &
  (
    | {
        scopeKeys?: string[];
        templateKey?: never;
        templateRevision?: never;
        cloneRoleKey?: never;
      }
    | {
        scopeKeys?: string[];
        templateKey: string;
        templateRevision?: number;
        cloneRoleKey?: never;
      }
    | {
        scopeKeys?: never;
        templateKey?: never;
        templateRevision?: never;
        cloneRoleKey: string;
      }
  );

interface UpdateRoleRequestBase {
  expectedVersion: number;
  reason?: string;
}

export type UpdateRoleRequest = UpdateRoleRequestBase &
  ({ displayName: string; description?: string | null } | { displayName?: string; description: string | null });

export interface RoleScopeRequest {
  expectedVersion: number;
  scopeKeys: string[];
  reason?: string;
  confirmationToken?: string;
}

export interface RoleTemplateUpgradeRequest {
  expectedVersion: number;
  targetRevision: number;
  reason?: string;
  confirmationToken?: string;
}

export interface RoleLifecycleRequest {
  expectedVersion: number;
  reason?: string;
  confirmationToken?: string;
}

export interface RoleDependencySummary {
  assignmentRows: number;
  legacyUserAssociations: number;
  activeRecords: number;
  deletedRecords: number;
  storedConfigReferences: number;
  runtimeConfigReferences: number;
  scanIncomplete: boolean;
  templatePinned: boolean;
}

export type RolePreviewOperation = 'role-scopes' | 'template-upgrade' | 'role-inactivate' | 'role-delete';

export interface RoleImpactPreview {
  operation: RolePreviewOperation;
  current: AuthorizationRole;
  proposed?: AuthorizationRole;
  addedScopeKeys: string[];
  removedScopeKeys: string[];
  affectedAssignments: number;
  dependencies?: RoleDependencySummary;
  warnings: string[];
  fatalErrors: string[];
  confirmationToken?: string;
}

export interface AuthorizationMutationResult<T> {
  data: T;
  version: number;
  auditEventId: string;
  requestId: string;
  batchId?: string;
  changed: boolean;
}

export interface SelectedRoleVersion {
  roleId: string;
  expectedVersion: number;
}

export interface BulkTemplateUpgradeRequest {
  templateKey: string;
  targetRevision: number;
  roles: SelectedRoleVersion[];
  reason?: string;
  confirmationToken?: string;
}

export interface BulkTemplateUpgradeRolePreview {
  roleId: string;
  roleKey: string;
  brandId: string;
  expectedVersion: number;
  currentRevision: number;
  targetRevision: number;
  addedScopeKeys: string[];
  removedScopeKeys: string[];
  changed: boolean;
}

export interface BulkTemplateUpgradeRoleConflict {
  roleId: string;
  expectedVersion: number;
  targetRevision: number;
  conflict: {
    code: string;
    status: number;
  };
}

export interface BulkTemplateUpgradePreview {
  operation: 'template-bulk-upgrade';
  templateKey: string;
  targetRevision: number;
  roles: Array<BulkTemplateUpgradeRolePreview | BulkTemplateUpgradeRoleConflict>;
  warnings: string[];
  fatalErrors: string[];
  confirmationToken?: string;
}

export interface AssignmentCatalogQuery {
  cursor?: string;
  limit?: number;
  userId?: string;
  roleKey?: string;
  source?: AssignmentSource;
  status?: AssignmentStatus;
  sourcePresent?: boolean;
  expiry?: AssignmentExpiryFilter;
}

export interface AuthorizationAssignment {
  id: string;
  principalId: string;
  roleId: string;
  roleKey: string;
  brandId?: string;
  source: AssignmentSource;
  sourceKey: string;
  status: AssignmentStatus;
  sourcePresent: boolean;
  assignedBy: string;
  assignedAt: string;
  expiresAt?: string;
  revokedBy?: string;
  revokedAt?: string;
  suppressedBy?: string;
  suppressedAt?: string;
  reason?: string;
  version: number;
}

export interface GrantAssignmentRequest {
  expectedVersion?: number;
  expiresAt?: string;
  reason?: string;
}

export interface AssignmentMutationRequest {
  expectedVersion: number;
  reason?: string;
}

export interface AuditCatalogQuery {
  cursor?: string;
  limit?: number;
  actorId?: string;
  brandId?: string;
  eventType?: AuthorizationAuditEventType;
  outcome?: AuthorizationAuditOutcome;
  targetType?: AuthorizationAuditTargetType;
  targetId?: string;
}

export interface AuthorizationAuditEvent {
  eventId: string;
  schemaVersion: number;
  eventType: AuthorizationAuditEventType;
  outcome: AuthorizationAuditOutcome;
  actorType: AuthorizationAuditActorType;
  actorId: string;
  authMethod: AuthorizationAuditAuthMethod;
  brandId?: string;
  targetType: AuthorizationAuditTargetType;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  reasonCode?: string;
  reason?: string;
  requestId?: string;
  batchId?: string;
  occurredAt: string;
}

export interface AuthorizationUiErrorState {
  status: number;
  code: string;
  message: string;
  requestId?: string;
  isConflict: boolean;
}
