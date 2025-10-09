import {TestBed} from "@angular/core/testing";
import {FormService} from "./form.service";
import {FormConfig} from "@researchdatabox/sails-ng-common";
import {
  ConfigService,
  getStubConfigService,
  getStubTranslationService,
  LoggerService,
  TranslationService,
  UtilityService
} from "@researchdatabox/portal-ng-common";
import {APP_BASE_HREF} from "@angular/common";
import {Title} from "@angular/platform-browser";
import {provideI18Next} from "angular-i18next";
import {provideHttpClient} from "@angular/common/http";
import {HttpTestingController, provideHttpClientTesting} from "@angular/common/http/testing";


describe('The FormService', () => {
  const configService = getStubConfigService();
  const translationService = getStubTranslationService();
  let service: FormService;
  let httpTesting: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: 'http://localhost'
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
        Title,
        FormService,
        provideI18Next(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ]
    });
    service = TestBed.inject(FormService);
    httpTesting = TestBed.inject(HttpTestingController);
  });
  it('should create an instance', () => {
    expect(service).toBeTruthy();
    httpTesting.verify();
  });
});
