import { AuthorizationAdminError, AuthorizationAdminService } from '../authorization-admin.service';
import { RoleListComponent } from './role-list.component';

describe('RoleListComponent', () => {
  it('loads protected role state, override counts, and source-row assignment counts', async () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'listScopes',
      'listTemplates',
      'listRoles',
      'getRole',
      'listAssignments',
      'toUiError',
    ]);
    const summary = {
      id: 'role-1',
      key: 'brand-admin',
      displayName: 'Brand administrator',
      contextType: 'brand' as const,
      brandId: 'brand-1',
      protectedKind: 'brand-admin' as const,
      status: 'active' as const,
      templateKey: 'brand-admin',
      templateRevision: 2,
      version: 3,
    };
    service.listScopes.and.resolveTo({ generation: 'gen-1', items: [] });
    service.listTemplates.and.resolveTo({ items: [] });
    service.listRoles.and.resolveTo({ items: [summary] });
    service.getRole.and.resolveTo({
      ...summary,
      baseScopeKeys: ['authorization.role.read'],
      effectiveScopeKeys: ['authorization.role.read'],
      overrides: [{ scopeKey: 'authorization.role.read', effect: 'add' }],
    });
    service.listAssignments.and.resolveTo({
      items: [
        {
          id: 'assignment-1',
          principalId: 'user-1',
          roleId: 'role-1',
          roleKey: 'brand-admin',
          source: 'manual',
          sourceKey: 'manual',
          status: 'active',
          sourcePresent: true,
          assignedBy: 'admin',
          assignedAt: '2026-01-01T00:00:00Z',
          version: 1,
        },
      ],
    });

    const component = new RoleListComponent(service);
    component.scopeKeys = ['authorization.role.read', 'authorization.assignment.read', 'system.authorization.manage'];
    await component.ngOnInit();
    expect(component.overrideCount(summary)).toBe(1);
    expect(component.assignmentCount(summary)).toBe('1');
    expect(component.roleSelectableForBulk(summary)).toBeFalse();
    expect(component.canManageSystem).toBeTrue();
  });

  it('uses explicit selected role ids and versions for system bulk previews', async () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'previewBulkTemplateUpgrade',
      'toUiError',
    ]);
    service.previewBulkTemplateUpgrade.and.resolveTo({
      operation: 'template-bulk-upgrade',
      templateKey: 'researcher',
      targetRevision: 3,
      roles: [],
      warnings: [],
      fatalErrors: [],
      confirmationToken: 'token',
    });
    const component = new RoleListComponent(service);
    component.scopeKeys = ['system.authorization.manage'];
    component.roles = [
      {
        id: 'role-1',
        key: 'researcher',
        displayName: 'Researcher',
        contextType: 'brand',
        brandId: 'brand-1',
        protectedKind: 'none',
        status: 'active',
        templateKey: 'researcher',
        templateRevision: 2,
        version: 7,
      },
    ];
    component.selectedRoleIds = new Set(['role-1']);
    component.bulkTemplateKey = 'researcher';
    component.bulkTargetRevision = 3;
    await component.previewBulkUpgrade();
    expect(service.previewBulkTemplateUpgrade).toHaveBeenCalledWith(
      jasmine.objectContaining({
        roles: [{ roleId: 'role-1', expectedVersion: 7 }],
      })
    );
    expect(component.bulkPreview?.confirmationToken).toBe('token');
  });

  it('fails scope-changing controls closed when the complete catalog cannot be bounded', async () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'listScopes',
      'listTemplates',
      'listRoles',
      'toUiError',
    ]);
    service.listScopes.and.resolveTo({ generation: 'generation-1', items: [], nextCursor: 'more-scopes' });
    service.listTemplates.and.resolveTo({ items: [] });
    service.listRoles.and.resolveTo({ items: [] });
    service.toUiError.and.callFake(error =>
      error instanceof AuthorizationAdminError
        ? error
        : new AuthorizationAdminError(0, 'authorization.client-error', 'Request failed')
    );
    const component = new RoleListComponent(service);
    component.scopeKeys = ['authorization.role.manage', 'authorization.scope.read'];

    await component.ngOnInit();

    expect(component.scopeCatalogAvailable).toBeFalse();
    expect(component.canCreateRole).toBeFalse();
    expect(component.supportingErrors[0].code).toBe('authorization.scope-catalog-truncated');
  });
});
