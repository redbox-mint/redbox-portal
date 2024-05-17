import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF, CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AppConfigComponent } from './app-config.component';
import { UtilityService, LoggerService, UserService, TranslationService, ConfigService, AppConfigService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService } from 'projects/researchdatabox/portal-ng-common/src/lib/helper.spec';
import { FormlyModule } from '@ngx-formly/core';
import { FormlyBootstrapModule } from '@ngx-formly/bootstrap';
import { ArrayTypeComponent } from './fieldTypes/array.type';
import { ObjectTypeComponent } from './fieldTypes/object.type';
import { FormlyFieldTextArea } from '@ngx-formly/bootstrap/textarea';

let configService: any;
let userService: any;
let translationService: any;
let appConfigService: any;

let app: any;

describe('AppConfigComponent', () => {
  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService();
    appConfigService = getStubAppConfigService();
    await TestBed.configureTestingModule({
      declarations: [
        AppConfigComponent,
        ObjectTypeComponent
      ],
      imports: [
        ReactiveFormsModule,
        CommonModule,
        FormlyModule.forRoot({
          types: [
            { name: 'array', component: ArrayTypeComponent },
            { name: 'object', component: ObjectTypeComponent },
            { name: 'textarea', component: FormlyFieldTextArea }
          ],
        }),
        FormlyBootstrapModule
      ],
      providers: [
        {
          provide: AppConfigService,
          useValue: appConfigService
        },
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
  it('Check form submission success', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    app.configKey = 'test';
    app.model = { "enabled": true, "title": "Test Title", "message": "Test Message" };
    app.onSubmit(app.model);

  });
  it('Check form submission failure', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    app.configKey = 'fail';
    app.model = { "enabled": true, "title": "Test Title", "message": "Test Message" };
    app.onSubmit(app.model);
  });

  it('Test form rendering', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.debugElement.nativeElement;
    
    // There should be a checkbox rendered
    const checkbox = compiled.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    // There should be a text field rendered
    const text = compiled.querySelector('input[type="text"]');
    expect(text).toBeTruthy();
    // There should be a text area rendered
    const textArea = compiled.querySelector('textarea');
    expect(textArea).toBeTruthy();
    
    // There should be a submit button
    const button = compiled.querySelector('button');
    expect(button).toBeTruthy();
    expect(button.textContent).toBe('Submit')
    
  });

});

export function getStubAppConfigService(recordData: any = {}) {

  return {
    waitForInit: function () {
      return this;
    },
    isInitializing: function () {
      return false;
    },
    getAppConfigForm(configKey: string) {
      return {
        fieldOrder: ["enabled", "title", "message"],
        schema: {
          "type": "object",
          "properties": {
            "enabled": {
              "type": "boolean"
            },
            "title": {
              "type": "string"
            },
            "message": {
              "type": "textarea"
            }
          }
        }
      }
    },
    saveAppConfig: function (configKey: string, model: any) {
      if (configKey === "fail") {
        return Promise.reject('Failure');
      }
      return new Promise((resolve, reject) => {
        resolve({
          success: true
        });
      });
    }

  }
}
