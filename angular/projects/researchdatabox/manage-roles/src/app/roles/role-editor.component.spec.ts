import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { AuthorizationAdminError, AuthorizationAdminService } from '../authorization-admin.service';
import { RoleEditorComponent } from './role-editor.component';

describe('RoleEditorComponent', () => {
  const role = {
    id: 'role-1',
    key: 'researcher',
    displayName: 'Researcher',
    contextType: 'brand' as const,
    brandId: 'brand-1',
    protectedKind: 'none' as const,
    status: 'active' as const,
    templateKey: 'researcher',
    templateRevision: 1,
    baseScopeKeys: ['record.read'],
    effectiveScopeKeys: ['record.read'],
    overrides: [],
    version: 2,
  };

  it('preserves editor input and offers comparison after a 409', async () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'getRole',
      'updateRole',
      'toUiError',
    ]);
    service.getRole.and.resolveTo(role);
    const conflict = new AuthorizationAdminError(
      409,
      'authorization.version-conflict',
      'input is preserved',
      'request-1'
    );
    service.updateRole.and.rejectWith(conflict);
    service.toUiError.and.returnValue(conflict);
    const component = new RoleEditorComponent(service);
    component.roleKey = 'researcher';
    component.canManage = true;
    component.scopeCatalogAvailable = true;
    await component.ngOnInit();
    component.displayName = 'Unsaved label';
    await component.saveMetadata();
    expect(component.displayName).toBe('Unsaved label');
    expect(component.error?.isConflict).toBeTrue();
    await component.loadRole(false);
    expect(component.serverComparison?.version).toBe(2);
    expect(component.displayName).toBe('Unsaved label');
  });

  it('requires a server confirmation token before applying scope changes', async () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'getRole',
      'previewRoleScopes',
      'applyRoleScopes',
      'toUiError',
    ]);
    service.getRole.and.resolveTo(role);
    service.previewRoleScopes.and.resolveTo({
      operation: 'role-scopes',
      current: role,
      proposed: { ...role, effectiveScopeKeys: ['record.read', 'record.update'] },
      addedScopeKeys: ['record.update'],
      removedScopeKeys: [],
      affectedAssignments: 3,
      warnings: [],
      fatalErrors: [],
      confirmationToken: 'confirmed',
    });
    service.applyRoleScopes.and.resolveTo({
      data: { ...role, effectiveScopeKeys: ['record.read', 'record.update'], version: 3 },
      version: 3,
      auditEventId: 'audit-1',
      requestId: 'request-1',
      changed: true,
    });
    const component = new RoleEditorComponent(service);
    component.roleKey = 'researcher';
    component.canManage = true;
    component.scopeCatalogAvailable = true;
    await component.ngOnInit();
    component.selectedScopeKeys = ['record.read', 'record.update'];
    await component.previewScopes();
    expect(component.preview?.affectedAssignments).toBe(3);
    component.selectedScopeKeys = ['record.delete'];
    component.reason = 'Changed after preview';
    await component.applyPreview();
    expect(service.applyRoleScopes).toHaveBeenCalledWith(
      'researcher',
      jasmine.objectContaining({
        expectedVersion: 2,
        scopeKeys: ['record.read', 'record.update'],
        confirmationToken: 'confirmed',
      })
    );
  });

  it('previews clone scopes but sends only the source role key, never assignments or protected identity', async () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'getRole',
      'createRole',
      'toUiError',
    ]);
    service.getRole.and.resolveTo(role);
    service.createRole.and.resolveTo({
      data: role,
      version: 1,
      auditEventId: 'audit',
      requestId: 'request',
      changed: true,
    });
    const component = new RoleEditorComponent(service);
    component.canManage = true;
    component.creationKind = 'clone';
    component.cloneRoleKey = 'researcher';
    await component.creationSourceChanged();
    component.key = 'researcher-copy';
    component.displayName = 'Researcher copy';
    await component.createRole();
    const request = service.createRole.calls.mostRecent().args[0];
    expect(request.cloneRoleKey).toBe('researcher');
    expect('assignments' in request).toBeFalse();
    expect('protectedKind' in request).toBeFalse();
  });

  it('keeps mutation affordances unavailable to a caller with read-only scope', async () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'getRole',
      'toUiError',
    ]);
    service.getRole.and.resolveTo(role);
    await TestBed.configureTestingModule({
      imports: [FormsModule],
      declarations: [RoleEditorComponent],
      providers: [{ provide: AuthorizationAdminService, useValue: service }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    const fixture = TestBed.createComponent(RoleEditorComponent);
    fixture.componentInstance.roleKey = role.key;
    fixture.componentInstance.canManage = false;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('#role-display-name') as HTMLInputElement).readOnly).toBeTrue();
    expect(fixture.nativeElement.querySelector('button.btn-primary')).toBeNull();
  });
});
