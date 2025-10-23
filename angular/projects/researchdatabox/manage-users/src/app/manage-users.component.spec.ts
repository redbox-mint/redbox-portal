import { TestBed } from '@angular/core/testing';
import { ManageUsersComponent } from './manage-users.component';
import { LOCALE_ID, inject as inject_1, provideAppInitializer } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common'; 
import { FormsModule, FormBuilder } from "@angular/forms";
import i18next from 'i18next';
import { I18NextModule, StrictErrorHandlingStrategy, provideI18Next, withCustomErrorHandlingStrategy } from 'angular-i18next';
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
    app.updateUserSubmit(usersData[0], true);
    expect(app.currentUser.roles.length).toBeGreaterThan(0);
    app.newUserSubmit(usersData[0], true);
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

  it('should map roles correctly', () => {
    const fixture = TestBed.createComponent(ManageUsersComponent);
    const app = fixture.componentInstance;
    const roles = [
      { key: '123', value: 'Admin', checked: true },
      { key: '456', value: 'User', checked: false }
    ];
    const mapped = app.mapRoles(roles);
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
