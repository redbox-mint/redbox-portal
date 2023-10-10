import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common'; 
import { FormBuilder } from '@angular/forms';
import { LocalAuthComponent } from './local-auth.component';
import { UtilityService, LoggerService, UserService, TranslationService, ConfigService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService, getStubUserService } from 'projects/researchdatabox/portal-ng-common/src/lib/helper.spec';

let configService:any;
let userService: any;
let translationService: any;
const username = 'testUser';
const password = 'very-scary-password';
let app: any;

describe('LocalAuthComponent', () => {
  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService();
    userService = getStubUserService(username, password);
    await TestBed.configureTestingModule({
      declarations: [
        LocalAuthComponent
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
    }).compileComponents();
    TestBed.inject(FormBuilder);
    TestBed.inject(LoggerService);
    TestBed.inject(UtilityService);
  });

  it('should create the app and handle valid/invalid login', async function () {
    const fixture = TestBed.createComponent(LocalAuthComponent);
    app = fixture.componentInstance;
    expect(app).toBeTruthy();
    fixture.detectChanges();
    // test init
    await app.waitForInit();
    expect(app.form).toBeTruthy();
    // test login message 
    app.form.setValue({'username': '', 'password': ''});
    expect(app.loginMessage).toEqual('Please provide a username.');
    app.form.setValue({'username': username, 'password': ''});
    expect(app.loginMessage).toEqual('Please provide a password.');
    const event = { preventDefault: function() {}};
    app.window = { location: { href: '' } };
    // test login suppression
    await app.onLogin(event);
    expect(app.isLoginDisabled).toBeTruthy();
    // test invalid login
    app.form.setValue({'username': username, 'password': 'wrong-password'});
    await app.onLogin(event);
    expect(app.loginResult.user).toBeNull();
    expect(app.loginMessage).toEqual(userService.loginResult.message);
    expect(app.window.location.href).toEqual('');
    // test valid login
    app.form.setValue({'username': username, 'password': password});
    await app.onLogin(event);
    expect(app.loginResult.user).toBeTruthy();
    expect(app.window.location.href).toEqual(userService.loginResult.url);
  });
});
