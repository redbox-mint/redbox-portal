import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { getStubTranslationService, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { AuthorizationMe } from './authorization-admin.models';
import { AuthorizationAdminService } from './authorization-admin.service';
import { ManageRolesComponent } from './manage-roles.component';

describe('ManageRolesComponent', () => {
  const projection: AuthorizationMe = {
    brand: { id: 'brand-1', name: 'Brand one' },
    rolloutMode: 'shadow' as const,
    principal: { category: 'system-admin' as const, authMethod: 'session', active: true, userId: 'admin' },
    roles: [],
    scopeKeys: [
      'authorization.role.read',
      'authorization.assignment.read',
      'authorization.scope.read',
      'authorization.audit.read',
      'system.authorization.manage',
    ],
  };
  let service: jasmine.SpyObj<AuthorizationAdminService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'waitForInit',
      'getMe',
      'toUiError',
    ]);
    service.waitForInit.and.resolveTo(service);
    service.getMe.and.resolveTo(projection);
    history.replaceState({}, '', `${location.pathname}?tab=scopes`);
    await TestBed.configureTestingModule({
      declarations: [ManageRolesComponent],
      providers: [
        LoggerService,
        { provide: TranslationService, useValue: getStubTranslationService() },
        { provide: AuthorizationAdminService, useValue: service },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  });

  it('loads /me once, honors the tab query, and shows staged rollout state', async () => {
    const fixture = TestBed.createComponent(ManageRolesComponent);
    fixture.autoDetectChanges(true);
    await fixture.componentInstance.waitForInit();
    await fixture.whenStable();
    expect(service.getMe).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.activeTab).toBe('scopes');
    expect(fixture.nativeElement.textContent).toContain('not authoritative');
    expect(fixture.nativeElement.querySelector('[role="tablist"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[role="tab"]').length).toBe(4);
  });

  it('gates tabs from effective scopes rather than usernames or labels', async () => {
    service.getMe.and.resolveTo({ ...projection, scopeKeys: ['authorization.role.read'] });
    const fixture = TestBed.createComponent(ManageRolesComponent);
    fixture.autoDetectChanges(true);
    await fixture.componentInstance.waitForInit();
    await fixture.whenStable();
    expect(fixture.componentInstance.availableTabs.map(tab => tab.id)).toEqual(['roles']);
    expect(fixture.nativeElement.querySelector('#authorization-tab-audit')).toBeNull();
  });

  it('implements arrow, Home, and End keyboard tab selection', async () => {
    const fixture = TestBed.createComponent(ManageRolesComponent);
    fixture.autoDetectChanges(true);
    await fixture.componentInstance.waitForInit();
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    fixture.componentInstance.activeTab = 'roles';
    fixture.componentInstance.onTabKeydown(event, 0);
    expect(fixture.componentInstance.activeTab).toBe('assignments');
    fixture.componentInstance.onTabKeydown(new KeyboardEvent('keydown', { key: 'End' }), 1);
    expect(fixture.componentInstance.activeTab).toBe('audit');
  });

  it('fails closed without rendering a tab panel when no administration scope is effective', async () => {
    service.getMe.and.resolveTo({ ...projection, scopeKeys: ['authorization.self.read'] });
    const fixture = TestBed.createComponent(ManageRolesComponent);
    fixture.autoDetectChanges(true);
    await fixture.componentInstance.waitForInit();
    await fixture.whenStable();

    expect(fixture.componentInstance.activeTab).toBeUndefined();
    expect(fixture.nativeElement.querySelector('[role="tabpanel"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('authorization-role-list')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('do not have access');
  });

  it('ignores an older projection response that completes after a newer refresh', async () => {
    const fixture = TestBed.createComponent(ManageRolesComponent);
    fixture.detectChanges();
    await fixture.componentInstance.waitForInit();
    let resolveOlder: (value: AuthorizationMe) => void = () => undefined;
    let resolveNewer: (value: AuthorizationMe) => void = () => undefined;
    const older = new Promise<AuthorizationMe>(resolve => {
      resolveOlder = resolve;
    });
    const newer = new Promise<AuthorizationMe>(resolve => {
      resolveNewer = resolve;
    });
    service.getMe.and.returnValues(older, newer);

    const olderRefresh = fixture.componentInstance.reloadProjection();
    const newerRefresh = fixture.componentInstance.reloadProjection();
    resolveNewer({ ...projection, brand: { id: 'brand-new', name: 'New projection' } });
    await newerRefresh;
    resolveOlder({ ...projection, brand: { id: 'brand-old', name: 'Stale projection' } });
    await olderRefresh;

    expect(fixture.componentInstance.projection?.brand?.id).toBe('brand-new');
  });
});
