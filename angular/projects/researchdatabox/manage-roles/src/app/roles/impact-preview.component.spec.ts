import { ImpactPreviewComponent } from './impact-preview.component';
import { AuthorizationRole } from '../authorization-admin.models';

describe('ImpactPreviewComponent', () => {
  it('enables confirmation only for a tokened preview without fatal errors', () => {
    const component = new ImpactPreviewComponent();
    const role: AuthorizationRole = {
      id: 'role-1',
      key: 'researcher',
      displayName: 'Researcher',
      contextType: 'brand',
      brandId: 'brand-1',
      protectedKind: 'none',
      status: 'active',
      baseScopeKeys: [],
      effectiveScopeKeys: [],
      overrides: [],
      version: 1,
    };
    component.preview = {
      operation: 'role-delete',
      current: role,
      addedScopeKeys: [],
      removedScopeKeys: [],
      affectedAssignments: 0,
      warnings: [],
      fatalErrors: [],
      confirmationToken: 'token',
    };
    expect(component.canConfirm).toBeTrue();
    expect(component.showConfirm).toBeTrue();
    component.preview = { ...component.preview, fatalErrors: ['role-has-dependencies'] };
    expect(component.canConfirm).toBeFalse();
    expect(component.showConfirm).toBeFalse();
  });
});
