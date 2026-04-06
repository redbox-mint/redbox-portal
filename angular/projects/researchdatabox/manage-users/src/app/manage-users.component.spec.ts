import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ManageUsersComponent } from './manage-users.component';
import { APP_BASE_HREF } from '@angular/common';
import { FormsModule, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ConfigService, I18NextPipe, LoggerService, TranslationService, UserService, UtilityService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService, getStubUserService } from '@researchdatabox/portal-ng-common';
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
        I18NextPipe,
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
        }
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
    app.auditSummary = { returnedCount: 1, truncated: false };

    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('manage-users-audit-raw-label');

    app.toggleAuditRaw(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('manage-users-audit-raw-label');
    expect(fixture.nativeElement.textContent).toContain(auditRecords[0].rawAdditionalContext);
  });

  it('should show translated fallback details when raw parsing fails', () => {
    const app = createBareComponent();
    const label = app.getAuditDetailsLabel(auditRecords[2] as any);
    expect(label).toBe('Account linking event');
  });

  it('should return user status labels for each account link state', () => {
    const app = createBareComponent();

    expect(app.getAccountStatusLabel({
      accountLinkState: 'disabled',
      disabledByPrimaryUsername: 'admin'
    } as any)).toContain('admin');
    expect(app.getAccountStatusLabel({ accountLinkState: 'disabled' } as any)).toBeTruthy();
    expect(app.getAccountStatusLabel({ accountLinkState: 'linked-alias' } as any)).toBeTruthy();
    expect(app.getAccountStatusLabel({ accountLinkState: 'primary' } as any)).toBeTruthy();
    expect(app.getAccountStatusLabel({ accountLinkState: 'active' } as any)).toBeTruthy();
  });

  it('should format account status detail strings for primary and linked accounts', () => {
    const app = createBareComponent();

    expect(app.getAccountStatusDetail({
      accountLinkState: 'primary',
      effectivePrimaryUsername: 'admin'
    } as any)).toContain('admin');
    expect(app.getAccountStatusDetail({
      accountLinkState: 'linked-alias',
      linkedAccountCount: 2
    } as any)).toContain('2');
    expect(app.getAccountStatusDetail({ accountLinkState: 'active' } as any)).toBe('');
  });

  it('should reset search state when starting a new account-link flow', async () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    fixtures.push(fixture);
    const app = fixture.componentInstance;
    app.currentUser = usersData[0] as any;
    app.searchLinkCandidates = jasmine.createSpy('searchLinkCandidates').and.resolveTo();

    await app.startLinkAccounts();

    expect(app.linkSearchTerm).toBe('');
    expect(app.selectedLinkCandidate).toBeNull();
    expect(app.linkSearchResults).toEqual([]);
    expect(app.searchLinkCandidates).toHaveBeenCalled();
  });

  it('should show an error when no link candidates are returned', async () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    fixtures.push(fixture);
    const app = fixture.componentInstance;
    app.currentUser = usersData[0] as any;
    app.linkSearchTerm = 'missing';
    userService.searchLinkCandidates = jasmine.createSpy('searchLinkCandidates').and.resolveTo([]);

    await app.searchLinkCandidates();

    expect(app.linkSearchResults).toEqual([]);
    expect(app.linkMessage.text).toContain('No matching accounts found.');
    expect(app.linkMessage.level).toBe('warning');
  });

  it('should show an error when no primary user is selected before linking accounts', async () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    fixtures.push(fixture);
    const app = fixture.componentInstance;
    app.currentUser = usersData[0] as any;
    app.selectedLinkCandidate = usersData[1] as any;

    await app.confirmLinkAccounts();

    expect(app.linkMessage.text).toContain('Select an account to link.');
    expect(app.linkMessage.level).toBe('danger');
  });

  it('should summarise account-link impacts on success', async () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    fixtures.push(fixture);
    const app = fixture.componentInstance;
    app.currentUser = usersData[0] as any;
    app.selectedLinkCandidate = usersData[1] as any;
    userService.linkAccounts = jasmine.createSpy('linkAccounts').and.resolveTo({
      primary: usersData[0],
      linkedAccounts: [usersData[1]],
      impact: { rolesMerged: 2, recordsRewritten: 3 }
    });
    userService.getUsers = jasmine.createSpy('getUsers').and.resolveTo(usersData);

    await app.confirmLinkAccounts();

    expect(app.linkMessage.text).toContain('Accounts linked successfully.');
    expect(app.linkMessage.text).toContain('2');
    expect(app.linkMessage.text).toContain('3');
    expect(app.linkMessage.level).toBe('success');
  });

  it('should surface disable and enable success messages', async () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    fixtures.push(fixture);
    const app = fixture.componentInstance;
    app.currentUser = usersData[0] as any;
    userService.disableUser = jasmine.createSpy('disableUser').and.resolveTo({ status: true, message: 'disabled' });
    userService.enableUser = jasmine.createSpy('enableUser').and.resolveTo({ status: true, message: 'enabled' });
    userService.getUsers = jasmine.createSpy('getUsers').and.resolveTo(usersData);

    await app.disableCurrentUser();
    expect(app.updateMessage.text).toContain('User disabled successfully.');
    expect(app.updateMessage.level).toBe('success');

    await app.enableCurrentUser();
    expect(app.updateMessage.text).toContain('User enabled successfully.');
    expect(app.updateMessage.level).toBe('success');
  });
});
