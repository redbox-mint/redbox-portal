import { TestBed } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { FormsModule } from "@angular/forms";
import { APP_BASE_HREF } from '@angular/common'; 
import { I18NextModule, I18NEXT_SERVICE } from 'angular-i18next';
import { UtilityService, LoggerService, ConfigService, TranslationService, RecordService, UserService } from '@researchdatabox/redbox-portal-core';
import { getStubConfigService, getStubTranslationService, getStubRecordService, getStubUserService } from '@researchdatabox/redbox-portal-core';

let configService:any;
let recordService: any;
let translationService: any;
let userService: any;
const username = 'testUser';
const password = 'some-password';

describe('DashboardComponent', () => {
  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService();
    recordService = getStubRecordService();
    userService = getStubUserService(username, password);
    const testModule = TestBed.configureTestingModule({
      declarations: [
        DashboardComponent
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
          provide: RecordService,
          useValue: recordService
        },
        {
          provide: UserService,
          useValue: userService
        }
      ]
    });
    TestBed.inject(I18NEXT_SERVICE);
    await testModule.compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    expect(dashboardComponent).toBeTruthy();
  });

  it(`should have as title '@researchdatabox/dashboard'`, () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    expect(dashboardComponent.title).toEqual('@researchdatabox/dashboard');
  });

  // it('should render title', () => {
  //   const fixture = TestBed.createComponent(DashboardComponent);
  //   fixture.detectChanges();
  //   const compiled = fixture.nativeElement as HTMLElement;
  //   expect(compiled.querySelector('.content span')?.textContent).toContain('@researchdatabox/dashboard app is running!');
  // });
});
