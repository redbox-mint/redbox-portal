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
    app.selectedCandidateId = user.id;
    const save = spyOn(userService, 'updateUserRoles').and.resolveTo({ status: true, message: '' });
    await app.addMember();
    expect(save).toHaveBeenCalledWith('candidate', ['Researcher', 'Admin']);
    expect(app.members().length).toBe(2);
    app.requestRemoval(user);
    await app.removeMember();
    expect(save).toHaveBeenCalledWith('candidate', ['Researcher']);
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
    expect(app.removeBlockedReason(admin)).toBe('admin-roles-last-role');
    fixture.destroy();
  });

  it('excludes existing members, disabled users and aliases from add search', async () => {
    const { fixture, app } = await createComponent();
    const base = { ...app.users[0], roles: [], email: 'person@example.test' };
    app.users.push({ ...base, id: 'eligible' }, { ...base, id: 'disabled', effectiveLoginDisabled: true }, { ...base, id: 'alias', accountLinkState: 'linked-alias' });
    app.memberSearch = 'person@';
    expect(app.candidates.map(user => user.id)).toEqual(['eligible']);
    fixture.destroy();
  });

  it('leaves membership unchanged when saving fails and permits retry', async () => {
    const { fixture, app } = await createComponent();
    const user: typeof app.users[number] = { ...app.users[0], id: 'candidate', roles: [] };
    app.users.push(user);
    app.memberSearch = 'Local';
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

});
