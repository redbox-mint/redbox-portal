import { TestBed } from '@angular/core/testing';
import { ManageRolesComponent } from './manage-roles.component';
import { APP_BASE_HREF } from '@angular/common'; 
import { FormsModule } from "@angular/forms";
import { ConfigService, I18NextPipe, LoggerService, TranslationService, UserService, UtilityService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService, getStubUserService } from '@researchdatabox/portal-ng-common';
import { HttpErrorResponse } from '@angular/common/http';

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
  for (const status of [0, 400, 403, 500]) {
    it(`displays a completed role-save failure for HTTP ${status} and keeps the selection`, async () => {
      const fixture = TestBed.createComponent(ManageRolesComponent);
      const app = fixture.componentInstance;
      const user = JSON.parse(JSON.stringify(usersData[0]));
      user.newRoles = [{ name: 'Researcher', hasRole: true }];
      app.currentUser = user;
      app.isDetailsModalShown = true;
      userService.updateUserRoles = jasmine.createSpy('updateUserRoles').and.rejectWith(new HttpErrorResponse({
        status,
        error: status ? { errors: [{ detail: 'Unknown role for brand' }] } : new ProgressEvent('error'),
      }));
      try {
        await app.saveCurrentUser({});
        expect(app.saveMsg).toContain(status ? 'Unknown role for brand' : 'check the current account state');
        expect(app.saveMsgType).toBe('danger');
        expect(app.isDetailsModalShown).toBeTrue();
        expect(app.currentUser).toEqual(user);
      } finally {
        fixture.destroy();
      }
    });
  }

  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService();
    userService = getStubUserService(username, password, {}, usersData, rolesData);
    const testModule = TestBed.configureTestingModule({
      declarations: [
        ManageRolesComponent
      ],
      imports: [
        FormsModule,
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

  it('should create the app and perform testing of basic functions', async () =>  {
    const fixture = TestBed.createComponent(ManageRolesComponent);
    const app = fixture.componentInstance;
    fixture.autoDetectChanges(true);
    expect(app).toBeTruthy();
    await app.waitForInit();
    await fixture.whenStable();
    expect(app.roles.length).toBeGreaterThan(0);
    app.users = usersData;
    app.filteredUsers = usersData;
    expect(app.users.length).toBeGreaterThan(0);
    app.editUser('admin');
    app.saveCurrentUser({});
    expect(app.currentUser.roles.length).toBeGreaterThan(0);
    expect(app.users.length).toBeGreaterThan(0);
    app.resetFilter();
    expect(app.filteredUsers.length).toBeGreaterThan(0);
  });
});
