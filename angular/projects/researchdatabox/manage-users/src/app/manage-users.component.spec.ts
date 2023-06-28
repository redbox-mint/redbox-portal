import { TestBed } from '@angular/core/testing';
import { ManageUsersComponent } from './manage-users.component';
import { APP_INITIALIZER, LOCALE_ID } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common'; 
import { FormsModule, FormBuilder } from "@angular/forms";
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
          passwords: { password: '', confirmPassword: '' },
          roles: [ 
                   {
                     name: "Admin",
                     id: "123"
                   } 
                ]
        }
   ];

describe('AppComponent', () => {
  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService();
    userService = getStubUserService(username, password, {}, usersData, rolesData);
    const testModule = TestBed.configureTestingModule({
      declarations: [
        ManageUsersComponent
      ],
      imports: [
        FormsModule,
        I18NextModule.forRoot()
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
        {
          provide: APP_INITIALIZER,
          useFactory: appInit,
          deps: [I18NEXT_SERVICE],
          multi: true,
        },
        {
          provide: LOCALE_ID,
          deps: [I18NEXT_SERVICE],
          useValue: localeId
        }
      ]
    });
    
    TestBed.inject(FormBuilder);
    TestBed.inject(UserService);
    TestBed.inject(I18NEXT_SERVICE);
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
    app.updateUserSubmit(usersData[0], true);
    expect(app.currentUser.roles.length).toBeGreaterThan(0);
    app.newUserSubmit(usersData[0], true);
    expect(app.currentUser.roles.length).toBeGreaterThan(0);
  });

});
