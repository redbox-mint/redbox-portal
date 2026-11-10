import { TestBed } from '@angular/core/testing';
import { ManageRolesComponent } from './manage-roles.component';
import { APP_BASE_HREF } from '@angular/common'; 
import { ModalModule } from 'ngx-bootstrap/modal';
import { FormsModule } from "@angular/forms";
import { ConfigService, I18NextPipe, LoggerService, TranslationService, UserService, UtilityService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService, getStubUserService } from '@researchdatabox/portal-ng-common';

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
          email: '',
          id: '',
          password: '',
          token: '',
          passwords: { password: '', confirmPassword: '' },
          roles: [ 
                   {
                     name: "Admin",
                     id: "123",
                     users: [],
                     hasRole: true
                   } 
                ],
          newRoles: [ 
            {
              name: "Researcher",
              id: "456",
              users: [],
              hasRole: true
            } 
         ],
         roleStr: 'Admin, Researcher'
        }
   ];

describe('AppComponent', () => {
  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService({ 'admin-retry': 'Retry' });
    userService = getStubUserService(username, password, {}, usersData, rolesData);
    const testModule = TestBed.configureTestingModule({
      declarations: [
        ManageRolesComponent
      ],
      imports: [
        FormsModule,
        ModalModule.forRoot(),
        I18NextPipe
      ],
      providers: [
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
    
    TestBed.inject(UserService);
    await testModule.compileComponents();
  });

  it('shows an initial read error and recovers with retry', async () => {
    const original = userService.getBrandRoles.bind(userService);
    const read = spyOn(userService, 'getBrandRoles').and.rejectWith({ status: 403 });
    configService.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
    const fixture = TestBed.createComponent(ManageRolesComponent);
    const component = fixture.componentInstance;
    const waiting = expectAsync(component.waitForInit()).toBeRejected();
    fixture.detectChanges();
    await waiting;
    fixture.detectChanges();
    expect(component.loadPending).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Sign in again');
    expect(fixture.nativeElement.textContent).toContain('Retry');
    read.and.callFake(original);
    await component.retryLoad();
    await component.waitForInit();
    expect(component.loadError).toBe('');
    expect(configService.refreshConfig).toHaveBeenCalled();
    fixture.destroy();
  });

  async function createComponent() {
    const fixture = TestBed.createComponent(ManageRolesComponent);
    fixture.detectChanges();
    await fixture.componentInstance.waitForInit();
    // Isolate membership mutations between tests.
    fixture.componentInstance.users = JSON.parse(JSON.stringify(usersData));
    return { fixture, app: fixture.componentInstance };
  }

  it('loads members including admin from the user endpoint and displays counts', async () => {
    const read = spyOn(userService, 'getUsers').and.resolveTo(usersData);
    const { fixture, app } = await createComponent();
    fixture.detectChanges();
    expect(read).toHaveBeenCalledWith({ includeDisabled: true });
    expect(app.members().map(user => user.username)).toEqual(['admin']);
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('Local Admin');
    fixture.destroy();
  });

  it('preserves other roles when adding and removing a member', async () => {
    const { fixture, app } = await createComponent();
    const researcher = { id: 'r', name: 'Researcher', users: [], hasRole: true };
    const user = { ...app.users[0], id: 'candidate', username: 'candidate', email: 'candidate@example.test', roles: [researcher] };
    app.users.push(user);
    app.memberSearch = 'EXAMPLE.TEST';
    app.candidates = [user];
    const current = [app.users[0], user];
    spyOn(userService, 'getUsers').and.callFake(() => Promise.resolve(current));
    app.selectedCandidateId = user.id;
    const save = spyOn(userService, 'updateUserRoles').and.resolveTo({ status: true, message: '' });
    await app.addMember();
    expect(save).toHaveBeenCalledWith('candidate', ['Researcher', 'Admin']);
    app.roleCounts['Admin'].removableActive = 2;
    expect(app.members().length).toBe(2);
    app.requestRemoval(user);
    const remove = spyOn(userService, 'removeRoleMember').and.resolveTo({ status: true, roles: [researcher] });
    await app.removeMember();
    expect(remove).toHaveBeenCalledWith(app.selectedRole!.id, 'candidate');
    expect(user.roles.map(role => role.name)).toEqual(['Researcher']);
    fixture.destroy();
  });

  it('protects the last active admin and users with only one role', async () => {
    const { fixture, app } = await createComponent();
    const save = spyOn(userService, 'updateUserRoles');
    const admin = app.users[0];
    expect(app.removeBlockedReason(admin)).toBe('admin-roles-last-admin');
    app.requestRemoval(admin);
    expect(app.pendingRemoval).toBeNull();
    expect(save).not.toHaveBeenCalled();
    app.users.push({ ...admin, id: 'disabled-admin', effectiveLoginDisabled: true });
    expect(app.removeBlockedReason(admin)).toBe('admin-roles-last-admin');
    app.selectedRole = { id: 'r', name: 'Researcher', users: [], hasRole: true };
    admin.roles = [app.selectedRole];
    expect(app.removeBlockedReason(admin)).toBe('admin-roles-default-blocked');
    fixture.destroy();
  });

  it('excludes existing members, disabled users and aliases from add search', async () => {
    const { fixture, app } = await createComponent();
    const base = { ...app.users[0], roles: [], email: 'person@example.test' };
    app.users.push({ ...base, id: 'eligible' }, { ...base, id: 'disabled', effectiveLoginDisabled: true }, { ...base, id: 'alias', accountLinkState: 'linked-alias' });
    app.memberSearch = 'person@';
    spyOn(userService, 'getUsers').and.resolveTo(app.users);
    await app.searchMembers();
    expect(app.candidates.map(user => user.id)).toEqual(['eligible']);
    fixture.destroy();
  });

  it('leaves membership unchanged when saving fails and permits retry', async () => {
    const { fixture, app } = await createComponent();
    const user: typeof app.users[number] = { ...app.users[0], id: 'candidate', roles: [] };
    app.users.push(user);
    app.memberSearch = 'Local';
    app.candidates = [user];
    app.selectedCandidateId = user.id;
    const save = spyOn(userService, 'updateUserRoles').and.rejectWith(new Error('Save failed'));
    await app.addMember();
    expect(user.roles).toEqual([]);
    expect(app.saveError).toBe('Save failed');
    expect(app.saving).toBeFalse();
    save.and.resolveTo({ status: true, message: '' });
    await app.addMember();
    expect(user.roles.map(role => role.name)).toEqual(['Admin']);
    fixture.destroy();
  });
  it('uses the brand and portal path for navigation', async () => {
    userService.brandingAndPortalUrl = '/default/rdmp';
    const { fixture } = await createComponent();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-admin-crumbs a').getAttribute('href')).toBe('/default/rdmp/admin');
    expect(fixture.nativeElement.querySelector('.rb-admin-page-actions a').getAttribute('href')).toBe('/default/rdmp/admin/users');
    fixture.destroy();
  });

  it('marks the configured default and replaces the only non-default role in one request', async () => {
    const { fixture, app } = await createComponent();
    const researcher = { id: 'r', name: 'Researcher', users: [], hasRole: true, descriptionKey: 'admin-roles-description-researcher' };
    const guest = { id: 'g', name: 'Guest', users: [], hasRole: true, isDefault: true };
    app.roles = [researcher, guest]; app.selectedRole = researcher;
    const user: typeof app.users[number] = { ...app.users[0], id: 'only-role', roles: [researcher] };
    app.users = [user];
    app.requestRemoval(user);
    expect(app.pendingRemoval).toBe(user);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.modal-body').textContent).toContain('admin-roles-replace-confirm');
    const remove = spyOn(userService, 'removeRoleMember').and.resolveTo({ status: true, roles: [guest] });
    await app.removeMember();
    expect(remove).toHaveBeenCalledOnceWith('r', 'only-role');
    expect(user.roles).toEqual([guest]);
    app.pendingRemoval = null; app.selectedRole = guest;
    app.requestRemoval(user); fixture.detectChanges();
    expect(app.blockedRemoval).toBe('admin-roles-default-blocked');
    expect(fixture.nativeElement.textContent).toContain('admin-roles-default-badge');
    expect(fixture.nativeElement.textContent).toContain('admin-roles-default-note');
    fixture.destroy();
  });

  it('edits, cancels and saves descriptions without changing the role name', async () => {
    const { fixture, app } = await createComponent();
    app.selectedRole!.description = 'Original';
    app.startDescriptionEdit(); app.descriptionDraft = 'Draft'; app.editingDescription = false;
    expect(app.selectedRole!.description).toBe('Original');
    app.startDescriptionEdit(); app.descriptionDraft = 'Edited description';
    const save = spyOn(userService, 'updateRoleDescription').and.resolveTo({ status: true });
    await app.saveDescription(); fixture.detectChanges();
    expect(save).toHaveBeenCalledOnceWith(app.selectedRole!.id, 'Edited description');
    expect(app.selectedRole!.description).toBe('Edited description');
    expect(app.editingDescription).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Edited description');
    fixture.destroy();
  });

  it('retains the draft when the description save fails', async () => {
    const { fixture, app } = await createComponent();
    app.startDescriptionEdit(); app.descriptionDraft = 'Retry this';
    spyOn(userService, 'updateRoleDescription').and.rejectWith(new Error('Unavailable'));
    await app.saveDescription();
    expect(app.descriptionDraft).toBe('Retry this'); expect(app.editingDescription).toBeTrue();
    expect(app.saveError).toBeTruthy(); expect(app.saving).toBeFalse();
    fixture.destroy();
  });

  it('pages members and rejects stale candidate searches after switching roles', async () => {
    const { fixture, app } = await createComponent();
    const result = { records: [], summary: { numFound: 140, page: 2, start: 25 }, roleCounts: { Researcher: { active: 130, disabled: 10, removableActive: 130 } } };
    const read = spyOn(userService, 'getUserPage').and.resolveTo(result);
    app.selectedRole = { id: 'r', name: 'Researcher' } as any;
    await app.loadMembers(2);
    expect(read).toHaveBeenCalledWith(jasmine.objectContaining({ page: 2, role: 'Researcher', includeDisabled: true }));
    expect(app.totalPages).toBe(6);
    expect(app.activeMemberCount()).toBe(130);
    let resolve!: (value: any) => void;
    read.and.returnValue(new Promise(done => resolve = done));
    app.memberSearch = 'someone';
    const pending = app.searchMembers();
    const oldResolve = resolve;
    read.and.resolveTo(result);
    await app.selectRole({ id: 'g', name: 'Guest' } as any);
    oldResolve({ ...result, records: [{ id: 'stale' }] });
    await pending;
    expect(app.candidates).toEqual([]);
    fixture.destroy();
  });

});
