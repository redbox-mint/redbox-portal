import { TestBed } from '@angular/core/testing';
import { ManageUsersComponent } from './manage-users.component';
import { LOCALE_ID, inject as inject_1, provideAppInitializer } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common'; 
import { FormsModule, FormBuilder, ReactiveFormsModule } from "@angular/forms";
import i18next from 'i18next';
import { I18NextModule, StrictErrorHandlingStrategy, provideI18Next, withCustomErrorHandlingStrategy } from 'angular-i18next';
import { UtilityService, LoggerService, TranslationService, ConfigService, UserService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService, getStubUserService, appInit, localeId } from '@researchdatabox/portal-ng-common';
import { ModalModule } from 'ngx-bootstrap/modal';

let configService:any;
let userService: any;
let translationService: any;
const username = 'testUser';
const password = 'very-scary-password';

let rolesData = [
        {
          name: "Admin",
          id: "123"
        }
    ];

let usersData = [
        {
          name: "Local Admin",
          username: "admin",
          type: "local",
          userid: "ABC123",
          id: "ABC123",
          email: '',
          accountLinkState: 'active',
          linkedAccountCount: 1,
          effectivePrimaryUsername: 'admin',
          passwords: { password: '', confirmPassword: '' },
          roles: [ 
                   {
                     name: "Admin",
                     id: "123"
                   } 
                ]
        },
        {
          name: "Alias User",
          username: "alias",
          type: "local",
          userid: "ALIAS123",
          id: "ALIAS123",
          email: 'alias@example.com',
          accountLinkState: 'linked-alias',
          linkedPrimaryUserId: 'ABC123',
          effectivePrimaryUsername: 'admin',
          passwords: { password: '', confirmPassword: '' },
          roles: []
        }
   ];

const auditRecords = [
  {
    id: 'audit-1',
    timestamp: '2026-03-27T10:00:00.000Z',
    action: 'login',
    actor: { username: 'admin', name: 'Local Admin', email: 'admin@example.com' },
    details: 'User logged in',
    parsedAdditionalContext: { ip: '127.0.0.1' },
    rawAdditionalContext: '{"ip":"127.0.0.1"}',
    parseError: false
  },
  {
    id: 'audit-2',
    timestamp: '2026-03-27T11:00:00.000Z',
    action: 'link-accounts',
    actor: { username: 'admin-user' },
    details: 'This account was chosen as the primary account during account linking',
    parsedAdditionalContext: { primaryUserId: 'ABC123', secondaryUserId: 'ALIAS123' },
    rawAdditionalContext: '{"primaryUserId":"ABC123","secondaryUserId":"ALIAS123"}',
    parseError: false
  },
  {
    id: 'audit-3',
    timestamp: '2026-03-27T12:00:00.000Z',
    action: 'link-accounts',
    actor: { username: 'admin-user' },
    details: 'Account linking event',
    parsedAdditionalContext: null,
    rawAdditionalContext: '[REDACTED_UNPARSEABLE_AUDIT_CONTEXT]',
    parseError: true
  }
];

export function i18AppInit() {
  return () => i18next
  .init({
    fallbackLng: 'en',
    debug: true
  });
}

describe('ManageUsersComponent', () => {
  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService({
      'manage-users-audit-event-login': 'User logged in',
      'manage-users-audit-event-logout': 'User logged out',
      'manage-users-audit-event-disable': 'Admin disabled this account',
      'manage-users-audit-event-enable': 'Admin enabled this account',
      'manage-users-audit-event-link-primary': 'This account was chosen as the primary account during account linking',
      'manage-users-audit-event-link-secondary': 'This account was linked as a secondary alias to another account',
      'manage-users-audit-event-link-generic': 'Account linking event'
    });
    userService = getStubUserService(username, password, {}, usersData, rolesData);
    userService.getUserAudit = jasmine.createSpy('getUserAudit').and.callFake((userId: string) => Promise.resolve({
      user: usersData.find((user) => user.id === userId) || usersData[0],
      records: auditRecords,
      summary: { returnedCount: auditRecords.length, truncated: false }
    }));
    const testModule = TestBed.configureTestingModule({
      declarations: [
        ManageUsersComponent
      ],
      imports: [
        FormsModule,
        ReactiveFormsModule,
        I18NextModule.forRoot(),
        ModalModule.forRoot()
      ],
      providers: [
        FormBuilder,
        {
          provide: APP_BASE_HREF,
          useValue: 'base'
        },
        LoggerService,
        UtilityService,
        {
          provide: TranslationService,
          useValue: translationService
        },
        {
          provide: ConfigService,
          useValue: configService
        },
        {
          provide: UserService,
          useValue: userService
        },
        provideAppInitializer(i18AppInit()),
        provideI18Next(
          withCustomErrorHandlingStrategy(StrictErrorHandlingStrategy)
        ),
      ]
    });
    
    TestBed.inject(FormBuilder);
    TestBed.inject(UserService);
    await testModule.compileComponents();
  });

  it('should create the app and perform testing of basic functions', async () =>  {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    const app = fixture.componentInstance;
    fixture.autoDetectChanges(true);
    expect(app).toBeTruthy();
    await app.waitForInit();
    await fixture.whenStable();
    expect(app.allRoles.length).toBeGreaterThan(0);
    expect(app.allUsers.length).toBeGreaterThan(0);
    app.newUser();
    expect(app.isNewUserModalShown).toEqual(true);
    app.hideNewUserModal();
    app.onNewUserHidden();
    expect(app.isNewUserModalShown).toEqual(false);
    app.editUser('admin');
    expect(app.isDetailsModalShown).toEqual(true);
    app.hideDetailsModal();
    app.onDetailsModalHidden();
    expect(app.isDetailsModalShown).toEqual(false);
    await app.updateUserSubmit(usersData[0] as any, true);
    expect(app.currentUser).not.toBeNull();
    if (app.currentUser == null) {
      fail('Expected currentUser to be set after editing a user');
      return;
    }
    expect(app.currentUser.roles.length).toBeGreaterThan(0);
    await app.newUserSubmit(usersData[0] as any, true);
    expect(app.currentUser.roles.length).toBeGreaterThan(0);
  });

  it('should filter users by name', async () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    const app = fixture.componentInstance;
    fixture.autoDetectChanges(true);
    await app.waitForInit();
    app.searchFilter.name = 'Local Admin';
    app.onFilterChange();
    expect(app.filteredUsers.length).toBeGreaterThan(0);
    expect(app.filteredUsers[0].name).toBe('Local Admin');
  });

  it('should render account status metadata from the users payload', async () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    const app = fixture.componentInstance;
    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Primary');
  });

  it('should render View Audit action for active users and linked aliases', async () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    const app = fixture.componentInstance;
    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('manage-users-audit-action');
    expect(text).toContain('Alias User');
    expect(text).toMatch(/manage-users-edit-link\s*\|\s*manage-users-link-manage\s*\|\s*manage-users-disable-action\s*\|\s*manage-users-audit-action/);
  });

  it('should open the audit modal, fetch records, and render them', async () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    const app = fixture.componentInstance;
    fixture.autoDetectChanges(true);
    await app.waitForInit();

    await app.viewAudit(usersData[0] as any);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(userService.getUserAudit).toHaveBeenCalledWith('ABC123');
    expect(app.isAuditModalShown).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('User logged in');
  });

  it('should render loading, empty, truncated, and error audit states', async () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    const app = fixture.componentInstance;

    app.auditModalUser = usersData[0] as any;
    app.isAuditModalShown = true;
    app.isAuditLoading = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('manage-users-audit-loading');

    app.isAuditLoading = false;
    app.auditRecords = [];
    app.auditError = '';
    app.auditSummary = { returnedCount: 0, truncated: false };
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('manage-users-audit-empty');

    app.auditSummary = { returnedCount: 100, truncated: true };
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('manage-users-audit-truncated');

    app.auditError = 'failed';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('failed');
  });

  it('should expand raw audit details and show the technical data heading', () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    const app = fixture.componentInstance;
    app.auditModalUser = usersData[0] as any;
    app.isAuditModalShown = true;
    app.auditRecords = [auditRecords[0] as any];
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('manage-users-audit-raw-toggle');

    app.toggleAuditRow('audit-1');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('manage-users-audit-raw-label');
    expect(fixture.nativeElement.textContent).toContain('manage-users-audit-raw-hide');
    expect(fixture.nativeElement.textContent).toContain('127.0.0.1');
  });

  it('should render link event details differently for primary and secondary users and fall back for malformed context', () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    const app = fixture.componentInstance;
    const secondaryLinkRecord = {
      ...auditRecords[1],
      details: 'This account was linked as a secondary alias to another account'
    };

    app.auditModalUser = usersData[0] as any;
    expect(app.getAuditDetailsLabel(auditRecords[1] as any)).toBe('This account was chosen as the primary account during account linking');

    app.auditModalUser = usersData[1] as any;
    expect(app.getAuditDetailsLabel(secondaryLinkRecord as any)).toBe('This account was linked as a secondary alias to another account');

    expect(app.getAuditDetailsLabel(auditRecords[2] as any)).toBe('Account linking event');
  });

  it('should derive account status badge and supporting text', () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    const app = fixture.componentInstance;
    expect(app.getAccountStatusBadge(usersData[0] as any)).toContain('Primary');
    expect(app.getAccountStatusContext(usersData[0] as any)).toContain('1');
    expect(app.getAccountStatusBadgeClass(usersData[0] as any)).toBe('info');

    const linkedAliasUser = {
      accountLinkState: 'linked-alias',
      effectivePrimaryUsername: 'admin'
    };
    expect(app.getAccountStatusBadge(linkedAliasUser as any)).toContain('Linked');
    expect(app.getAccountStatusContext(linkedAliasUser as any)).toContain('admin');
    expect(app.getAccountStatusBadgeClass(linkedAliasUser as any)).toBe('default');
  });

  it('should hide API key controls and suppress role errors for linked aliases until submit', async () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    const app = fixture.componentInstance;
    app.allRoles = rolesData as any;
    app.currentUser = {
      id: 'linked-1',
      username: 'alias-user',
      name: 'Alias User',
      email: 'alias@example.com',
      type: 'local',
      accountLinkState: 'linked-alias',
      effectivePrimaryUsername: 'admin',
      roles: []
    } as any;
    app.setupForms(false);
    app.isDetailsModalShown = true;
    fixture.detectChanges();

    const textBeforeSubmit = fixture.nativeElement.textContent;
    expect(textBeforeSubmit).toContain('manage-users-password-linked-notice');
    expect(textBeforeSubmit).toContain('manage-users-api-linked-notice');
    expect(textBeforeSubmit).toContain('manage-users-roles-linked-notice');
    expect(textBeforeSubmit).not.toContain('manage-users-confirm-password');
    expect(textBeforeSubmit).not.toContain('manage-users-update-password');
    expect(textBeforeSubmit).not.toContain('Generate API Key');
    expect(textBeforeSubmit).not.toContain('Admin');
    expect(textBeforeSubmit).not.toContain('manage-users-validation-role');

    app.submitted = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('manage-users-roles-linked-notice');
    expect(fixture.nativeElement.textContent).not.toContain('manage-users-validation-role');
  });

  it('should map roles correctly', () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    const app = fixture.componentInstance;
    const roles = [
      { key: '123', value: 'Admin', checked: true },
      { key: '456', value: 'User', checked: false }
    ];
    const mapped = app.mapRoles(roles);
    expect(mapped).not.toBeNull();
    if (mapped == null) {
      fail('Expected selected roles to be mapped');
      return;
    }
    expect(mapped.length).toBe(1);
    expect(mapped[0].name).toBe('Admin');
  });

  it('should show and hide modals', async () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    const app = fixture.componentInstance;
    app.isDetailsModalShown = false;
    app.showDetailsModal();
    expect(app.isDetailsModalShown).toBeTrue();
    app.onDetailsModalHidden();
    expect(app.isDetailsModalShown).toBeFalse();
    app.isNewUserModalShown = false;
    app.showNewUserModal();
    expect(app.isNewUserModalShown).toBeTrue();
    app.onNewUserHidden();
    expect(app.isNewUserModalShown).toBeFalse();
  });

  it('should set update and new user messages', () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    const app = fixture.componentInstance;
    app.setUpdateMessage('msg', 'danger');
    expect(app.updateDetailsMsg).toBe('msg');
    expect(app.updateDetailsMsgType).toBe('danger');
    app.setNewUserMessage('msg2', 'primary');
    expect(app.newUserMsg).toBe('msg2');
    expect(app.newUserMsgType).toBe('primary');
  });

  it('should handle invalid user submit', async () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    const app = fixture.componentInstance;
    spyOn(app, 'setUpdateMessage');
    await app.updateUserSubmit({} as any, false);
    expect(app.setUpdateMessage).toHaveBeenCalled();
    spyOn(app, 'setNewUserMessage');
    await app.newUserSubmit({} as any, false);
    expect(app.setNewUserMessage).toHaveBeenCalled();
  });

});
