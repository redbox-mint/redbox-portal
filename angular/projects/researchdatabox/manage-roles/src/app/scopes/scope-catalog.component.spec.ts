import { AuthorizationAdminService } from '../authorization-admin.service';
import { ScopeCatalogComponent } from './scope-catalog.component';

describe('ScopeCatalogComponent', () => {
  it('loads a read-only filtered catalog and derives bounded current-brand role usage', async () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'listScopes',
      'listRoles',
      'getRole',
      'toUiError',
    ]);
    service.listScopes.and.resolveTo({
      generation: 'generation-9',
      items: [
        {
          key: 'record.read',
          namespace: 'record',
          label: 'Read records',
          description: 'Read records',
          risk: 'read',
          sourceType: 'core',
          sourcePackage: 'redbox-core',
          sourceVersion: '1',
          status: 'active',
          metadataVersion: 1,
        },
      ],
    });
    service.listRoles.and.resolveTo({
      items: [
        {
          id: 'role-1',
          key: 'researcher',
          displayName: 'Researcher',
          contextType: 'brand',
          brandId: 'brand-1',
          protectedKind: 'none',
          status: 'active',
          version: 1,
        },
      ],
    });
    service.getRole.and.resolveTo({
      id: 'role-1',
      key: 'researcher',
      displayName: 'Researcher',
      contextType: 'brand',
      brandId: 'brand-1',
      protectedKind: 'none',
      status: 'active',
      version: 1,
      baseScopeKeys: [],
      effectiveScopeKeys: ['record.read'],
      overrides: [],
    });
    const component = new ScopeCatalogComponent(service);
    component.scopeKeys = ['authorization.role.read'];
    component.risk = 'read';
    component.status = 'active';
    await component.ngOnInit();
    expect(service.listScopes).toHaveBeenCalledWith(jasmine.objectContaining({ risk: 'read', status: 'active' }));
    expect(component.usageLabel('record.read')).toContain('Researcher');
    expect(component.generation).toBe('generation-9');
  });
});
