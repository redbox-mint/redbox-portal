import { AuthorizationAdminError, AuthorizationAdminService } from '../authorization-admin.service';
import { AssignmentListComponent } from './assignment-list.component';

describe('AssignmentListComponent', () => {
  const researcherRole = {
    id: 'role-1',
    key: 'researcher',
    displayName: 'Researcher',
    contextType: 'brand' as const,
    brandId: 'brand-1',
    protectedKind: 'none' as const,
    status: 'active' as const,
    version: 1,
  };
  const researcherDetail = {
    ...researcherRole,
    baseScopeKeys: ['record.read'],
    effectiveScopeKeys: ['record.read'],
    overrides: [],
  };
  const manual = {
    id: 'manual-1',
    principalId: 'user-1',
    roleId: 'role-1',
    roleKey: 'researcher',
    source: 'manual' as const,
    sourceKey: 'manual',
    status: 'active' as const,
    sourcePresent: true,
    assignedBy: 'admin',
    assignedAt: '2026-01-01T00:00:00Z',
    version: 2,
  };
  const external = {
    ...manual,
    id: 'external-1',
    source: 'external' as const,
    sourceKey: 'oidc:researchers',
    version: 3,
  };

  it('applies user/source/status/presence/expiry filters on the server', async () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'listRoles',
      'getRole',
      'listAssignments',
      'toUiError',
    ]);
    service.listRoles.and.resolveTo({ items: [] });
    service.listAssignments.and.resolveTo({ items: [manual] });
    const component = new AssignmentListComponent(service);
    component.userId = 'user-1';
    component.source = 'manual';
    component.status = 'active';
    component.sourcePresent = 'true';
    component.expiry = 'unexpired';
    await component.ngOnInit();
    expect(service.listAssignments).toHaveBeenCalledWith(
      jasmine.objectContaining({
        userId: 'user-1',
        source: 'manual',
        status: 'active',
        sourcePresent: true,
        expiry: 'unexpired',
      })
    );
  });

  it('keeps manual revoke and external suppression as distinct source-specific controls', () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', ['toUiError']);
    const component = new AssignmentListComponent(service);
    component.scopeKeys = ['authorization.assignment.manage'];
    expect(component.canRevoke(manual)).toBeTrue();
    expect(component.canSuppress(manual)).toBeFalse();
    expect(component.canRevoke(external)).toBeFalse();
    expect(component.canSuppress(external)).toBeTrue();
    expect(component.canUnsuppress({ ...external, status: 'suppressed' })).toBeTrue();
    expect(component.canSuppress({ ...external, source: 'migration' })).toBeFalse();
    expect(component.canUnsuppress({ ...external, source: 'recovery', status: 'suppressed' })).toBeFalse();
  });

  it('uses the projected protected system role key instead of inventing a conventional key', () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', ['toUiError']);
    const component = new AssignmentListComponent(service);
    component.scopeKeys = ['authorization.assignment.manage', 'system.authorization.manage'];
    component.effectiveRoles = [
      {
        id: 'system-role-1',
        key: 'deployment-superuser',
        displayName: 'Deployment administrator',
        contextType: 'system',
        protectedKind: 'system-admin',
        implicit: false,
      },
    ];

    expect(component.availableRoles.map(role => role.key)).toEqual(['deployment-superuser']);
    expect(component.availableRoles.some(role => role.key === 'system-admin')).toBeFalse();
  });

  it('sends an explicit local expiry as an offset ISO timestamp', async () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'grantAssignment',
      'listAssignments',
      'toUiError',
    ]);
    service.grantAssignment.and.resolveTo({
      data: manual,
      version: 2,
      auditEventId: 'audit',
      requestId: 'request',
      changed: true,
    });
    service.listAssignments.and.resolveTo({ items: [] });
    const component = new AssignmentListComponent(service);
    component.scopeKeys = ['authorization.assignment.manage', 'record.read'];
    component.roles = [researcherRole];
    component.roleDetails = new Map([[researcherDetail.id, researcherDetail]]);
    component.grantUserId = 'user-1';
    component.grantRoleKey = 'researcher';
    component.grantExpiresAt = '2030-01-02T12:30';
    await component.grantAssignment();
    expect(service.grantAssignment).toHaveBeenCalledWith(
      'researcher',
      'user-1',
      jasmine.objectContaining({
        expiresAt: new Date('2030-01-02T12:30').toISOString(),
      })
    );
    expect(component.liveMessage).toBe('Manual researcher assignment granted or reactivated.');
  });

  it('rejects an invalid local expiry before issuing a mutation', async () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'grantAssignment',
      'toUiError',
    ]);
    const component = new AssignmentListComponent(service);
    component.scopeKeys = ['authorization.assignment.manage', 'record.read'];
    component.roles = [researcherRole];
    component.roleDetails = new Map([[researcherDetail.id, researcherDetail]]);
    component.grantUserId = 'user-1';
    component.grantRoleKey = 'researcher';
    component.grantExpiresAt = 'not-a-date';

    await component.grantAssignment();

    expect(service.grantAssignment).not.toHaveBeenCalled();
    expect(component.error?.message).toContain('valid expiry');
  });

  it('uses the row version when changing an existing manual assignment expiry', async () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'grantAssignment',
      'listAssignments',
      'toUiError',
    ]);
    service.grantAssignment.and.resolveTo({
      data: { ...manual, expiresAt: '2030-01-02T12:30:00Z', version: 3 },
      version: 3,
      auditEventId: 'audit',
      requestId: 'request',
      changed: true,
    });
    service.listAssignments.and.resolveTo({ items: [] });
    const component = new AssignmentListComponent(service);
    component.scopeKeys = ['authorization.assignment.manage', 'record.read'];
    component.roles = [researcherRole];
    component.roleDetails = new Map([[researcherDetail.id, researcherDetail]]);
    component.editManualAssignment({ ...manual, expiresAt: '2029-01-02T12:30:00Z' });
    component.grantExpiresAt = '2030-01-02T12:30';

    await component.grantAssignment();

    expect(service.grantAssignment).toHaveBeenCalledWith(
      'researcher',
      'user-1',
      jasmine.objectContaining({
        expectedVersion: 2,
        expiresAt: new Date('2030-01-02T12:30').toISOString(),
      })
    );
    expect(component.grantExpectedVersion).toBeUndefined();
  });

  it('prevents assigning a role whose effective scopes exceed the caller delegation ceiling', async () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'grantAssignment',
      'toUiError',
    ]);
    const component = new AssignmentListComponent(service);
    component.scopeKeys = ['authorization.assignment.manage'];
    component.roles = [researcherRole];
    component.roleDetails = new Map([[researcherDetail.id, researcherDetail]]);
    component.grantUserId = 'user-1';
    component.grantRoleKey = 'researcher';

    await component.grantAssignment();

    expect(service.grantAssignment).not.toHaveBeenCalled();
    expect(component.error?.message).toContain('assignable role');
  });

  it('retains expiry input and compares the current row before rebasing a conflicted edit', async () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'grantAssignment',
      'listAssignments',
      'toUiError',
    ]);
    const conflict = new AuthorizationAdminError(
      409,
      'authorization.version-conflict',
      'input is preserved',
      'request-1'
    );
    service.grantAssignment.and.rejectWith(conflict);
    service.toUiError.and.returnValue(conflict);
    service.listAssignments.and.resolveTo({ items: [{ ...manual, version: 3 }] });
    const component = new AssignmentListComponent(service);
    component.scopeKeys = ['authorization.assignment.manage', 'record.read'];
    component.roles = [researcherRole];
    component.roleDetails = new Map([[researcherDetail.id, researcherDetail]]);
    component.editManualAssignment(manual);
    component.grantExpiresAt = '2030-01-02T12:30';

    await component.grantAssignment();
    await component.reloadAssignmentForComparison();

    expect(component.grantExpiresAt).toBe('2030-01-02T12:30');
    expect(component.grantExpectedVersion).toBe(2);
    expect(component.serverComparisonAssignment?.version).toBe(3);
    component.useServerAssignmentVersion();
    expect(component.grantExpectedVersion).toBe(3);
  });
});
