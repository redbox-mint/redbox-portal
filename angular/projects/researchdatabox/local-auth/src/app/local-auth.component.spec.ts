import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common'; 
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { LocalAuthComponent } from './local-auth.component';
import { UtilityService, LoggerService, UserService, TranslationService, ConfigService, I18NextPipe } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService, getStubUserService } from '../../../portal-ng-common/src/lib/helper.spec';

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
      imports: [ReactiveFormsModule, I18NextPipe],
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

  for (const status of [0, 400, 401, 403, 404, 409, 410, 413, 415, 422, 500, 503]) {
    for (const envelope of ['v1', 'v2', 'empty']) {
      it(`recovers login after HTTP ${status} with a ${envelope} error response`, async () => {
        const fixture = TestBed.createComponent(LocalAuthComponent);
        const component = fixture.componentInstance;
        fixture.detectChanges();
        await component.waitForInit();
        component.form.setValue({ username, password });
        component.window = { location: { href: '' } };
        const detail = 'The login could not be completed.';
        userService.loginLocal = jasmine.createSpy('loginLocal').and.rejectWith(new HttpErrorResponse({
          status,
          error: envelope === 'v1' ? { message: detail }
            : envelope === 'v2' ? { errors: [{ detail }] } : null,
        }));
        try {
          await component.onLogin({ preventDefault() {} });
          fixture.detectChanges();
          expect(component.isLoginDisabled).toBeFalse();
          expect(component.loginMessage).toContain('Refresh this page before trying again.');
          if (envelope !== 'empty') expect(component.loginMessage).toContain(detail);
          expect(component.form.value).toEqual({ username, password });
          expect(component.window.location.href).toBe('');
          expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBeFalse();
          expect(fixture.nativeElement.querySelector('.alert-danger').textContent).toContain(component.loginMessage);
        } finally {
          fixture.destroy();
        }
      });
    }
  }

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
