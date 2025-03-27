import { TestBed } from '@angular/core/testing';
import { ManageRolesComponent } from './manage-roles.component';
import { LOCALE_ID, inject as inject_1, provideAppInitializer } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common'; 
import { FormsModule } from "@angular/forms";
import { I18NextModule, I18NEXT_SERVICE } from 'angular-i18next';
import { UtilityService, LoggerService, TranslationService, ConfigService, UserService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService, getStubUserService, appInit, localeId } from '@researchdatabox/portal-ng-common';

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
    translationService = getStubTranslationService();
    userService = getStubUserService(username, password, {}, usersData, rolesData);
    const testModule = TestBed.configureTestingModule({
      declarations: [
        ManageRolesComponent
      ],
      imports: [
        FormsModule,
        I18NextModule.forRoot()
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
        },
        provideAppInitializer(() => {
        const initializerFn = (appInit)(inject(I18NEXT_SERVICE));
        return initializerFn();
      }),
        {
          provide: LOCALE_ID,
          deps: [I18NEXT_SERVICE],
          useValue: localeId
        }
      ]
    });
    
    TestBed.inject(UserService);
    TestBed.inject(I18NEXT_SERVICE);
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
