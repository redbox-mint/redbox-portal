import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common'; 
import { I18NextModule, I18NEXT_SERVICE } from 'angular-i18next';
import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { FormBuilder } from '@angular/forms';
import { LocalAuthComponent } from './local-auth.component';
import { UtilityService, LoggerService, UserService, TranslationService, ConfigService } from '@researchdatabox/redbox-portal-core';

describe('LocalAuthComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        HttpClientTestingModule,
        I18NextModule.forRoot()
      ],
      declarations: [
        LocalAuthComponent
      ],
      providers: [
        HttpClient,
        FormBuilder,
        {
          provide: APP_BASE_HREF,
          useValue: 'base'
        },
        UserService,
        LoggerService,
        UtilityService,
        TranslationService,
        ConfigService
      ]
    }).compileComponents();
    TestBed.inject(HttpClient);
    TestBed.inject(FormBuilder);
    TestBed.inject(ConfigService);
    TestBed.inject(LoggerService);
    TestBed.inject(UtilityService);
    TestBed.inject(TranslationService);
    TestBed.inject(UserService);
  });

  it('should create the app', async function () {
    const fixture = TestBed.createComponent(LocalAuthComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
    // await app.ngOnInit();
    // expect(app.form).toBeTruthy();
  });

  // it(`should have as title '@researchdatabox/localAuth'`, () => {
  //   const fixture = TestBed.createComponent(LocalAuthComponent);
  //   const app = fixture.componentInstance;
  //   expect(app.title).toEqual('@researchdatabox/localAuth');
  // });

  // it('should render title', () => {
  //   const fixture = TestBed.createComponent(LocalAuthComponent);
  //   fixture.detectChanges();
  //   const compiled = fixture.nativeElement as HTMLElement;
  //   expect(compiled.querySelector('.content span')?.textContent).toContain('@researchdatabox/localAuth app is running!');
  // });
});
