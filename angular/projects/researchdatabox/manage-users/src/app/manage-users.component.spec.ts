import { TestBed, ComponentFixture } from '@angular/core/testing';
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
let fixtures: ComponentFixture<ManageUsersComponent>[] = [];
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

  afterEach(() => {
    for (const fixture of fixtures) {
      fixture.destroy();
    }
    fixtures = [];
  });

  function createComponent(): { fixture: ComponentFixture<ManageUsersComponent>, app: ManageUsersComponent } {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    fixtures.push(fixture);
    const app = fixture.componentInstance;
    fixture.detectChanges();
    return { fixture, app };
  }

  function createBareComponent(): ManageUsersComponent {
    return new ManageUsersComponent(
      TestBed.inject(LoggerService),
      TestBed.inject(TranslationService),
      TestBed.inject(UserService),
      TestBed.inject(FormBuilder)
    );
  }

  it('should create the app and perform testing of basic functions', async () =>  {
    const app = createBareComponent();
    expect(app).toBeTruthy();
    app.allRoles = rolesData as any;
    app.allUsers = usersData as any;
    app.filteredUsers = usersData as any;
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
    const app = createBareComponent();
    app.allUsers = usersData as any;
    app.filteredUsers = usersData as any;
    app.searchFilter.name = 'Local Admin';
    app.onFilterChange();
    expect(app.filteredUsers.length).toBeGreaterThan(0);
    expect(app.filteredUsers[0].name).toBe('Local Admin');
  });

  it('should open the audit modal, fetch records, and render them', async () => {
    const app = createBareComponent();

    await app.viewAudit(usersData[0] as any);

    expect(userService.getUserAudit).toHaveBeenCalledWith('ABC123');
    expect(app.isAuditModalShown).toBeTrue();
    expect(app.auditModalUser?.id).toBe('ABC123');
    expect(app.auditRecords.length).toBe(auditRecords.length);
    expect(app.getAuditDetailsLabel(auditRecords[0] as any)).toBe('User logged in');
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

  it('should reset link and audit modal state when hidden', () => {
    const { app } = createComponent();
    app.isLinkModalShown = true;
    app.linkPrimaryUser = usersData[0] as any;
    app.linkedAccounts = [{ id: 'ALIAS123', username: 'alias' }] as any;
    app.linkCandidates = [{ id: 'candidate-1', username: 'candidate' }] as any;
    app.linkSearchQuery = 'candidate';
    app.selectedLinkCandidate = { id: 'candidate-1', username: 'candidate' } as any;
    app.setLinkMessage('problem', 'danger');
    app.onLinkModalHidden();

    expect(app.isLinkModalShown).toBeFalse();
    expect(app.linkPrimaryUser).toBeNull();
    expect(app.linkedAccounts).toEqual([]);
    expect(app.linkCandidates).toEqual([]);
    expect(app.linkSearchQuery).toBe('');
    expect(app.selectedLinkCandidate).toBeNull();
    expect(app.linkMsg).toBe('');
    expect(app.linkMsgType).toBe('primary');

    app.isAuditModalShown = true;
    app.auditModalUser = usersData[0] as any;
    app.auditRecords = [auditRecords[0] as any];
    app.auditExpandedRows = { 'audit-1': true };
    app.isAuditLoading = true;
    app.auditError = 'failed';
    app.auditSummary = { returnedCount: 2, truncated: true };
    app.onAuditModalHidden();

    expect(app.isAuditModalShown).toBeFalse();
    expect(app.auditModalUser).toBeNull();
    expect(app.auditRecords).toEqual([]);
    expect(app.auditExpandedRows).toEqual({});
    expect(app.isAuditLoading).toBeFalse();
    expect(app.auditError).toBe('');
    expect(app.auditSummary).toEqual({ returnedCount: 0, truncated: false });
  });

  it('should search and submit link candidates', async () => {
    const { app } = createComponent();
    await app.waitForInit();
    spyOn(userService, 'getUsers').and.resolveTo(usersData);
    spyOn(userService, 'getUserLinks').and.resolveTo({
      primary: usersData[0],
      linkedAccounts: [{ id: 'ALIAS123', username: 'alias', name: 'Alias User', email: 'alias@example.com', type: 'local' }]
    });
    spyOn(userService, 'searchLinkCandidates').and.resolveTo([
      { id: 'candidate-1', username: 'candidate', name: 'Candidate User', email: 'candidate@example.com', type: 'local' }
    ]);
    spyOn(userService, 'linkAccounts').and.resolveTo({
      primary: usersData[0],
      linkedAccounts: [{ id: 'candidate-1', username: 'candidate', name: 'Candidate User', email: 'candidate@example.com', type: 'local' }],
      impact: { rolesMerged: 2, recordsRewritten: 3 }
    });

    await app.manageLinks('admin');
    expect(app.isLinkModalShown).toBeTrue();
    expect(app.linkPrimaryUser?.username).toBe('admin');
    expect(app.linkedAccounts.length).toBe(1);

    app.linkSearchQuery = 'candidate';
    await app.searchCandidates();
    expect(userService.searchLinkCandidates).toHaveBeenCalledWith('ABC123', 'candidate');
    expect(app.linkCandidates.length).toBe(1);

    app.selectLinkCandidate(app.linkCandidates[0] as any);
    await app.submitLink();
    expect(userService.linkAccounts).toHaveBeenCalledWith('ABC123', 'candidate-1');
    expect(app.linkedAccounts.length).toBe(1);
    expect(app.linkCandidates).toEqual([]);
    expect(app.selectedLinkCandidate).toBeNull();
    expect(app.linkSearchQuery).toBe('');
    expect(app.linkMsgType).toBe('success');
    expect(app.linkMsg).toContain('Accounts linked successfully.');
    expect(app.linkMsg).toContain('2 role(s) merged');
    expect(app.linkMsg).toContain('3 record(s) rewritten');
  });

  it('should handle empty and failed account linking flows', async () => {
    const app = createBareComponent();
    app.allUsers = usersData as any;
    app.linkPrimaryUser = usersData[0] as any;

    spyOn(userService, 'searchLinkCandidates').and.resolveTo([]);
    app.linkSearchQuery = '   ';
    await app.searchCandidates();
    expect(userService.searchLinkCandidates).not.toHaveBeenCalled();
    expect(app.linkCandidates).toEqual([]);
    expect(app.selectedLinkCandidate).toBeNull();

    app.linkSearchQuery = 'nobody';
    await app.searchCandidates();
    expect(app.linkMsgType).toBe('warning');
    expect(app.linkMsg).toBe('No matching accounts found.');

    (userService.searchLinkCandidates as jasmine.Spy).and.rejectWith(new Error('search failed'));
    await app.searchCandidates();
    expect(app.linkMsgType).toBe('danger');
    expect(app.linkMsg).toBe('Failed to search accounts.');

    spyOn(userService, 'getUserLinks').and.rejectWith(new Error('load failed'));
    await app.refreshLinkModalData();
    expect(app.linkMsg).toBe('load failed');
    expect(app.linkedAccounts).toEqual([]);

    await app.submitLink();
    expect(app.linkMsg).toBe('Select an account to link.');

    spyOn(userService, 'linkAccounts').and.rejectWith(new Error('link failed'));
    app.selectedLinkCandidate = { id: 'ALIAS123', username: 'alias' } as any;
    await app.submitLink();
    expect(app.linkMsg).toBe('link failed');
  });

  it('should derive audit titles, actors, toggle labels, and raw content', async () => {
    const { app } = createComponent();
    await app.waitForInit();

    await app.viewAudit(usersData[0] as any);
    expect(app.getAuditTitle()).toBe('Audit history for Local Admin');
    expect(app.getAuditActor(auditRecords[0] as any)).toBe('admin | Local Admin | admin@example.com');
    expect(app.getAuditActionLabel(auditRecords[0] as any)).toBe('login');
    expect(app.formatAuditTimestamp(auditRecords[0].timestamp)).not.toBe('');
    expect(app.getAuditToggleLabel('audit-1')).toBe('manage-users-audit-raw-toggle');

    app.toggleAuditRow('audit-1');
    expect(app.isAuditRowExpanded('audit-1')).toBeTrue();
    expect(app.getAuditToggleLabel('audit-1')).toBe('manage-users-audit-raw-hide');
    expect(app.getAuditRawContent(auditRecords[0] as any)).toContain('"ip": "127.0.0.1"');
    expect(app.getAuditRawContent(auditRecords[2] as any)).toBe('[REDACTED_UNPARSEABLE_AUDIT_CONTEXT]');
    expect(app.getAuditRawContent({ parsedAdditionalContext: 'plain text' } as any)).toBe('plain text');
    expect(app.getAuditRawContent({ parsedAdditionalContext: null, rawAdditionalContext: 'raw' } as any)).toBe('raw');
    expect(app.formatAuditTimestamp(null)).toBe('');
  });

  it('should handle audit fetch failures and audit action label fallbacks', async () => {
    const { app } = createComponent();
    await app.waitForInit();
    (userService.getUserAudit as jasmine.Spy).and.rejectWith(new Error('audit failed'));

    await app.viewAudit(usersData[0] as any);

    expect(app.auditError).toBe('audit failed');
    expect(app.auditRecords).toEqual([]);
    expect(app.auditSummary).toEqual({ returnedCount: 0, truncated: false });
    expect(app.isAuditLoading).toBeFalse();
    expect(app.getAuditDetailsLabel({ action: 'logout', details: 'fallback', actor: { username: 'admin' } } as any)).toBe('fallback');
    expect(app.getAuditDetailsLabel({ action: 'disable-user', details: 'fallback', actor: { username: 'admin' } } as any)).toBe('fallback');
    expect(app.getAuditDetailsLabel({ action: 'enable-user', details: 'fallback', actor: { username: 'admin' } } as any)).toBe('fallback');
    expect(app.getAuditDetailsLabel({ action: 'other', details: 'fallback', actor: { username: 'admin' } } as any)).toBe('fallback');
  });

  it('should toggle disabled users and handle enable and disable actions', async () => {
    const { app } = createComponent();
    await app.waitForInit();
    spyOn(userService, 'getUsers').and.resolveTo(usersData);
    spyOn(userService, 'disableUser').and.resolveTo({ status: true, message: 'ok' });
    spyOn(userService, 'enableUser').and.resolveTo({ status: false, message: 'nope' });

    await app.toggleShowDisabled();
    expect(app.showDisabledUsers).toBeTrue();
    expect(userService.getUsers).toHaveBeenCalledWith({ includeDisabled: true });

    await app.disableUser(usersData[0] as any);
    expect(app.updateDetailsMsgType).toBe('success');
    expect(app.updateDetailsMsg).toBe('User disabled successfully.');

    await app.enableUser(usersData[0] as any);
    expect(app.updateDetailsMsgType).toBe('danger');
    expect(app.updateDetailsMsg).toBe('nope');

    (userService.disableUser as jasmine.Spy).and.rejectWith(new Error('disable crash'));
    await app.disableUser(usersData[0] as any);
    expect(app.updateDetailsMsg).toBe('disable crash');

    (userService.enableUser as jasmine.Spy).and.rejectWith(new Error('enable crash'));
    await app.enableUser(usersData[0] as any);
    expect(app.updateDetailsMsg).toBe('enable crash');
  });

  it('should cover password helpers, disabled helpers, and filter reset helpers', async () => {
    const { app } = createComponent();
    await app.waitForInit();
    app.currentUser = {
      ...usersData[0],
      effectiveLoginDisabled: true,
      loginDisabled: false,
      disabledByPrimaryUsername: 'admin'
    } as any;
    app.setupForms(false);
    app.setupForms(true);

    const updatePasswords = ((app.updateUserForm as any).controls['passwords']);
    updatePasswords.setErrors({ passwordStrengthDetails: { errors: ['Too short'] } });
    updatePasswords.controls['confirmPassword'].markAsTouched();
    const newPasswords = ((app.newUserForm as any).controls['passwords']);
    newPasswords.setErrors({ passwordStrengthDetails: { errors: ['Need symbol'] } });

    app.searchFilter.name = 'Admin';
    app.searchFilter.prevName = '';
    app.searchFilter.users = [
      { value: null, label: 'Any', checked: false },
      { value: 'Local Admin', label: 'Local Admin', checked: true }
    ];
    app.resetFilter();

    expect(app.isEffectivelyDisabled(app.currentUser as any)).toBeTrue();
    expect(app.isDirectlyDisabled({ loginDisabled: true } as any)).toBeTrue();
    expect(app.isDisabledViaPrimary(app.currentUser as any)).toBeTrue();
    expect(app.canManageLinks(usersData[0] as any)).toBeTrue();
    expect(app.canManageLinks(usersData[1] as any)).toBeFalse();
    expect(app.getAccountStatusBadge(app.currentUser as any)).toBe('Disabled via admin');
    expect(app.getAccountStatusBadge({ effectiveLoginDisabled: true, loginDisabled: true } as any)).toBe('Disabled');
    expect(app.getAccountStatusBadge({} as any)).toBe('Active');
    expect(app.getAccountStatusBadgeClass({ effectiveLoginDisabled: true } as any)).toBe('danger');
    expect(app.getAccountStatusContext({} as any)).toBeNull();
    expect(app.isUpdateUserFormConfirmPasswordTouched()).toBeTrue();
    expect(app.getUpdateUserPasswordErrors()).toEqual(['Too short']);
    expect(app.getNewUserPasswordErrors()).toEqual(['Need symbol']);
    expect(app.getNewUserPasswordFormControls()['password']).toBeDefined();
    expect(app.getUpdateUserFormControls().length).toBe(rolesData.length);
    expect(app.getNewUserFormControls().length).toBe(rolesData.length);
    expect(app.filteredUsers.length).toBe(usersData.length);
    expect(app.searchFilter.users[0].checked).toBeTrue();
  });

});
