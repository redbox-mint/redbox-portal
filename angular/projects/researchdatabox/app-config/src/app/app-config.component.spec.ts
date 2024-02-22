import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common'; 
import { FormBuilder } from '@angular/forms';
import { AppConfigComponent } from './app-config.component';
import { UtilityService, LoggerService, UserService, TranslationService, ConfigService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService, getStubUserService } from 'projects/researchdatabox/portal-ng-common/src/lib/helper.spec';

let configService:any;
let userService: any;
let translationService: any;

let app: any;

describe('AppConfigComponent', () => {
  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService();
    
    await TestBed.configureTestingModule({
      declarations: [
        AppConfigComponent
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

  
});
