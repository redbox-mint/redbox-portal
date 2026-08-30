import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import {
  AssignmentCatalogQuery,
  AssignmentExpiryFilter,
  AssignmentSource,
  AssignmentStatus,
  AuthorizationAssignment,
  AuthorizationEffectiveRole,
  AuthorizationRole,
  AuthorizationRoleSummary,
  AuthorizationUiErrorState,
  ProtectedRoleKind,
  RoleStatus,
} from '../authorization-admin.models';
import { AuthorizationAdminError, AuthorizationAdminService } from '../authorization-admin.service';

interface AssignmentRoleOption {
  id: string;
  key: string;
  displayName: string;
  protectedKind: ProtectedRoleKind;
  status: RoleStatus;
  delegable: boolean;
}

@Component({
  selector: 'authorization-assignment-list',
  templateUrl: './assignment-list.component.html',
  styleUrls: ['./assignment-list.component.scss'],
  standalone: false,
})
export class AssignmentListComponent implements OnInit {
  @Input() public scopeKeys: string[] = [];
  @Input() public effectiveRoles: AuthorizationEffectiveRole[] = [];
  @Output() public readonly authorizationChanged = new EventEmitter<void>();

  public assignments: AuthorizationAssignment[] = [];
  public roles: AuthorizationRoleSummary[] = [];
  public roleDetails = new Map<string, AuthorizationRole>();
  public nextCursor?: string;
  public loading = false;
  public pendingId?: string;
  public error?: AuthorizationUiErrorState;
  public roleLoadError?: AuthorizationUiErrorState;
  public liveMessage = '';

  public userId = '';
  public roleKey = '';
  public source: AssignmentSource | '' = '';
  public status: AssignmentStatus | '' = '';
  public sourcePresent: '' | 'true' | 'false' = '';
  public expiry: AssignmentExpiryFilter | '' = '';

  public grantUserId = '';
  public grantRoleKey = '';
  public grantExpiresAt = '';
  public grantExpectedVersion?: number;
  public editingAssignmentId?: string;
  public serverComparisonAssignment?: AuthorizationAssignment;
  public mutationReason = '';
  public readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  private assignmentLoadId = 0;

  // Phase 0 left the CSV/JSON bulk-assignment UI unapproved. The delivered typed
  // service retains the bounded API methods, but this Phase 9 view deliberately
  // does not present a bulk apply surface without that product approval.

  constructor(private readonly authorizationAdminService: AuthorizationAdminService) {}

  public get canManage(): boolean {
    return this.scopeKeys.includes('authorization.assignment.manage');
  }
  public get canManageSystem(): boolean {
    return this.scopeKeys.includes('system.authorization.manage');
  }
  public get mutationPending(): boolean {
    return this.pendingId !== undefined;
  }
  public get availableRoles(): AssignmentRoleOption[] {
    const rolesByKey = new Map<string, AssignmentRoleOption>();
    for (const role of this.roles) {
      const detail = this.roleDetails.get(role.id);
      rolesByKey.set(role.key, {
        id: role.id,
        key: role.key,
        displayName: role.displayName,
        protectedKind: role.protectedKind,
        status: role.status,
        delegable: detail?.effectiveScopeKeys.every(scopeKey => this.scopeKeys.includes(scopeKey)) ?? false,
      });
    }
    if (this.canManageSystem) {
      for (const role of this.effectiveRoles.filter(candidate => candidate.protectedKind === 'system-admin')) {
        rolesByKey.set(role.key, {
          id: role.id,
          key: role.key,
          displayName: role.displayName,
          protectedKind: role.protectedKind,
          status: 'active',
          delegable: true,
        });
      }
    }
    return [...rolesByKey.values()];
  }
  public get editingManualAssignment(): boolean {
    return this.grantExpectedVersion !== undefined;
  }

  public async ngOnInit(): Promise<void> {
    await this.loadRoles();
    await this.loadAssignments(false);
  }

  public async loadAssignments(append: boolean): Promise<void> {
    const loadId = ++this.assignmentLoadId;
    this.loading = true;
    this.liveMessage = 'Loading assignment source rows.';
    this.error = undefined;
    try {
      const query: AssignmentCatalogQuery = {
        limit: 50,
        ...(append && this.nextCursor ? { cursor: this.nextCursor } : {}),
        ...(this.userId.trim() ? { userId: this.userId.trim() } : {}),
        ...(this.roleKey ? { roleKey: this.roleKey } : {}),
        ...(this.source ? { source: this.source } : {}),
        ...(this.status ? { status: this.status } : {}),
        ...(this.sourcePresent ? { sourcePresent: this.sourcePresent === 'true' } : {}),
        ...(this.expiry ? { expiry: this.expiry } : {}),
      };
      const page = await this.authorizationAdminService.listAssignments(query);
      if (loadId !== this.assignmentLoadId) return;
      this.assignments = append ? [...this.assignments, ...page.items] : page.items;
      this.nextCursor = page.nextCursor;
      this.liveMessage = `${this.assignments.length} assignment source rows loaded.`;
    } catch (error) {
      if (loadId !== this.assignmentLoadId) return;
      this.setError(error);
    } finally {
      if (loadId === this.assignmentLoadId) this.loading = false;
    }
  }

  public resetFilters(): void {
    this.userId = '';
    this.roleKey = '';
    this.source = '';
    this.status = '';
    this.sourcePresent = '';
    this.expiry = '';
    void this.loadAssignments(false);
  }

  public grantRoleAllowed(role: AssignmentRoleOption): boolean {
    return (
      role.status === 'active' &&
      role.delegable &&
      role.protectedKind !== 'guest' &&
      (role.protectedKind !== 'system-admin' || this.canManageSystem)
    );
  }

  public async grantAssignment(): Promise<void> {
    if (!this.canManage) return;
    const role = this.availableRoles.find(candidate => candidate.key === this.grantRoleKey);
    if (!this.grantUserId.trim() || !role || !this.grantRoleAllowed(role)) {
      this.setClientError('A user ID and assignable role are required.');
      return;
    }
    const expiresAt = this.normalizedExpiry();
    if (this.grantExpiresAt && !expiresAt) {
      this.setClientError('Enter a valid expiry date and time.');
      return;
    }
    this.pendingId = 'grant';
    this.liveMessage = 'Granting or reactivating the manual assignment.';
    this.error = undefined;
    try {
      await this.authorizationAdminService.grantAssignment(this.grantRoleKey, this.grantUserId.trim(), {
        ...(this.grantExpectedVersion !== undefined ? { expectedVersion: this.grantExpectedVersion } : {}),
        ...(expiresAt ? { expiresAt } : {}),
        ...(this.mutationReason.trim() ? { reason: this.mutationReason.trim() } : {}),
      });
      const successMessage = `Manual ${this.grantRoleKey} assignment granted or reactivated.`;
      this.grantUserId = '';
      this.grantRoleKey = '';
      this.grantExpiresAt = '';
      this.grantExpectedVersion = undefined;
      this.editingAssignmentId = undefined;
      this.serverComparisonAssignment = undefined;
      await this.afterMutation(successMessage);
    } catch (error) {
      this.setError(error);
    } finally {
      this.pendingId = undefined;
    }
  }

  public async revoke(assignment: AuthorizationAssignment): Promise<void> {
    if (!this.canRevoke(assignment)) return;
    await this.mutate(assignment, 'revoke', () =>
      this.authorizationAdminService.revokeAssignment(assignment.roleKey, assignment.principalId, {
        expectedVersion: assignment.version,
        ...(this.mutationReason.trim() ? { reason: this.mutationReason.trim() } : {}),
      })
    );
  }

  public async suppress(assignment: AuthorizationAssignment): Promise<void> {
    if (!this.canSuppress(assignment)) return;
    await this.mutate(assignment, 'suppress', () =>
      this.authorizationAdminService.suppressAssignment(assignment.id, {
        expectedVersion: assignment.version,
        ...(this.mutationReason.trim() ? { reason: this.mutationReason.trim() } : {}),
      })
    );
  }

  public async unsuppress(assignment: AuthorizationAssignment): Promise<void> {
    if (!this.canUnsuppress(assignment)) return;
    await this.mutate(assignment, 'unsuppress', () =>
      this.authorizationAdminService.unsuppressAssignment(assignment.id, {
        expectedVersion: assignment.version,
        ...(this.mutationReason.trim() ? { reason: this.mutationReason.trim() } : {}),
      })
    );
  }

  public canRevoke(assignment: AuthorizationAssignment): boolean {
    return this.canManage && assignment.source === 'manual' && assignment.status === 'active';
  }

  public canSuppress(assignment: AuthorizationAssignment): boolean {
    return this.canManage && assignment.source === 'external' && assignment.status === 'active';
  }

  public canUnsuppress(assignment: AuthorizationAssignment): boolean {
    return this.canManage && assignment.source === 'external' && assignment.status === 'suppressed';
  }

  public canEditManualAssignment(assignment: AuthorizationAssignment): boolean {
    return this.canManage && assignment.source === 'manual' && assignment.status !== 'suppressed';
  }

  public editManualAssignment(assignment: AuthorizationAssignment): void {
    if (!this.canEditManualAssignment(assignment)) return;
    this.grantUserId = assignment.principalId;
    this.grantRoleKey = assignment.roleKey;
    this.grantExpiresAt = assignment.expiresAt ? this.toLocalDateTime(assignment.expiresAt) : '';
    this.grantExpectedVersion = assignment.version;
    this.editingAssignmentId = assignment.id;
    this.serverComparisonAssignment = undefined;
    this.error = undefined;
    this.liveMessage = `Editing the version ${assignment.version} manual assignment.`;
    queueMicrotask(() => document.getElementById('grant-expiry')?.focus());
  }

  public cancelManualEdit(): void {
    this.grantUserId = '';
    this.grantRoleKey = '';
    this.grantExpiresAt = '';
    this.grantExpectedVersion = undefined;
    this.editingAssignmentId = undefined;
    this.serverComparisonAssignment = undefined;
  }

  public async reloadAssignmentForComparison(): Promise<void> {
    const editingAssignmentId = this.editingAssignmentId;
    await this.loadAssignments(false);
    if (this.error || !editingAssignmentId) return;
    const current = this.assignments.find(assignment => assignment.id === editingAssignmentId);
    if (!current) {
      this.setClientError(
        'The assignment is no longer present in the current filtered results. Your input is retained.'
      );
      return;
    }
    this.serverComparisonAssignment = current;
    this.liveMessage = `Server assignment version ${current.version} loaded for comparison; your expiry input is unchanged.`;
  }

  public useServerAssignmentVersion(): void {
    if (!this.serverComparisonAssignment || !this.editingAssignmentId) return;
    this.grantExpectedVersion = this.serverComparisonAssignment.version;
    this.liveMessage = `Retry will require server assignment version ${this.serverComparisonAssignment.version}.`;
  }

  private async loadRoles(): Promise<void> {
    this.roleLoadError = undefined;
    try {
      const roles: AuthorizationRoleSummary[] = [];
      let cursor: string | undefined;
      for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
        const page = await this.authorizationAdminService.listRoles({ limit: 100, ...(cursor ? { cursor } : {}) });
        roles.push(...page.items);
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      if (cursor) {
        throw new AuthorizationAdminError(
          0,
          'authorization.role-catalog-truncated',
          'The role catalog exceeded the safe assignment-editor loading limit, so new grants are unavailable.'
        );
      }
      const details = await this.loadRoleDetails(roles);
      this.roles = roles;
      this.roleDetails = new Map(details.map(role => [role.id, role]));
    } catch (error) {
      this.roleLoadError = this.authorizationAdminService.toUiError(error);
      this.liveMessage = this.roleLoadError.message;
    }
  }

  private async loadRoleDetails(roles: AuthorizationRoleSummary[]): Promise<AuthorizationRole[]> {
    const details: AuthorizationRole[] = [];
    const batchSize = 10;
    for (let index = 0; index < roles.length; index += batchSize) {
      const batch = roles.slice(index, index + batchSize);
      details.push(...(await Promise.all(batch.map(role => this.authorizationAdminService.getRole(role.key)))));
    }
    return details;
  }

  private async mutate(
    assignment: AuthorizationAssignment,
    action: string,
    mutation: () => Promise<unknown>
  ): Promise<void> {
    this.pendingId = assignment.id;
    this.liveMessage = `${action} is in progress.`;
    this.error = undefined;
    try {
      await mutation();
      await this.afterMutation(`${action} completed for ${assignment.roleKey} and ${assignment.principalId}.`);
    } catch (error) {
      this.setError(error);
    } finally {
      this.pendingId = undefined;
    }
  }

  private async afterMutation(successMessage: string): Promise<void> {
    await this.loadAssignments(false);
    if (!this.error) {
      this.liveMessage = successMessage;
    }
    this.authorizationChanged.emit();
  }

  private setError(error: unknown): void {
    this.error = this.authorizationAdminService.toUiError(error);
    this.liveMessage = this.error.message;
  }

  private setClientError(message: string): void {
    this.error = { status: 0, code: 'authorization.invalid-input', message, isConflict: false };
    this.liveMessage = message;
  }

  private normalizedExpiry(): string | undefined {
    if (!this.grantExpiresAt) return undefined;
    const expiry = new Date(this.grantExpiresAt);
    return Number.isNaN(expiry.getTime()) ? undefined : expiry.toISOString();
  }

  private toLocalDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }
}
