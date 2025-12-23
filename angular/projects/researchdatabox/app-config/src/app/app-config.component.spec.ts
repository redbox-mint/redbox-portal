import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF, CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AppConfigComponent } from './app-config.component';
import { UtilityService, LoggerService, UserService, TranslationService, ConfigService, AppConfigService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService } from 'projects/researchdatabox/portal-ng-common/src/lib/helper.spec';
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core';
import { FormlyBootstrapModule } from '@ngx-formly/bootstrap';
import { ArrayTypeComponent } from './fieldTypes/array.type';
import { ObjectTypeComponent } from './fieldTypes/object.type';
import { FormlyFieldTextArea } from '@ngx-formly/bootstrap/textarea';
import { MenuEditorTypeComponent } from './fieldTypes/menu-editor';
import { AdminSidebarEditorTypeComponent } from './fieldTypes/admin-sidebar-editor';
import { HomePanelsEditorTypeComponent } from './fieldTypes/home-panels-editor';

let configService: any;
let userService: any;
let translationService: any;
let appConfigService: any;

let app: any;

function findFieldByKey(fields: FormlyFieldConfig[] | undefined, key: string): FormlyFieldConfig | undefined {
  if (!fields) {
    return undefined;
  }

  for (const field of fields) {
    if (field.key === key) {
      return field;
    }
    const nested = findFieldByKey(field.fieldGroup, key);
    if (nested) {
      return nested;
    }
    if (field.fieldArray) {
      const arrayNested = findFieldByKey((field.fieldArray as any).fieldGroup, key);
      if (arrayNested) {
        return arrayNested;
      }
    }
  }
  return undefined;
}

describe('AppConfigComponent', () => {
  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService();
    appConfigService = getStubAppConfigService();
    await TestBed.configureTestingModule({
      declarations: [
        AppConfigComponent,
        ArrayTypeComponent,
        ObjectTypeComponent,
        MenuEditorTypeComponent,
        AdminSidebarEditorTypeComponent,
        HomePanelsEditorTypeComponent
      ],
      imports: [
        ReactiveFormsModule,
        CommonModule,
        FormlyModule.forRoot({
          types: [
            { name: 'array', component: ArrayTypeComponent },
            { name: 'object', component: ObjectTypeComponent },
            { name: 'textarea', component: FormlyFieldTextArea },
            { name: 'menu-editor', component: MenuEditorTypeComponent },
            { name: 'admin-sidebar-editor', component: AdminSidebarEditorTypeComponent },
            { name: 'home-panels-editor', component: HomePanelsEditorTypeComponent }
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

  it('applies menu editor type and hides showSearch for menu config', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    app.configKey = 'menu';

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();

    const itemsField = findFieldByKey(app.fields, 'items');
    const showSearchField = findFieldByKey(app.fields, 'showSearch');

    expect(itemsField?.type).toBe('menu-editor');
    expect(itemsField?.fieldGroup).toBeUndefined();
    expect(showSearchField?.hide).toBeTrue();
  });

  it('applies admin sidebar editor type and hides sections/footerLinks', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    app.configKey = 'adminSidebar';

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();

    const headerField = findFieldByKey(app.fields, 'header');
    const sectionsField = findFieldByKey(app.fields, 'sections');
    const footerLinksField = findFieldByKey(app.fields, 'footerLinks');

    expect(headerField?.type).toBe('admin-sidebar-editor');
    expect(headerField?.fieldGroup).toBeUndefined();
    expect(sectionsField?.hide).toBeTrue();
    expect(footerLinksField?.hide).toBeTrue();
  });

  it('applies home panels editor type for homePanels config', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    app.configKey = 'homePanels';

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();

    const panelsField = findFieldByKey(app.fields, 'panels');

    expect(panelsField?.type).toBe('home-panels-editor');
    expect(panelsField?.fieldGroup).toBeUndefined();
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
      if (configKey === 'menu') {
        return {
          fieldOrder: ['showSearch', 'items'],
          schema: {
            type: 'object',
            properties: {
              showSearch: { type: 'boolean' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    labelKey: { type: 'string' },
                    href: { type: 'string' }
                  }
                }
              }
            }
          },
          model: {
            showSearch: true,
            items: []
          }
        };
      }
      if (configKey === 'homePanels') {
        return {
          fieldOrder: ['panels'],
          schema: {
            type: 'object',
            properties: {
              panels: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    titleKey: { type: 'string' },
                    iconClass: { type: 'string' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          labelKey: { type: 'string' },
                          href: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          model: {
            panels: []
          }
        };
      }
      if (configKey === 'adminSidebar') {
        return {
          fieldOrder: ['header', 'sections', 'footerLinks'],
          schema: {
            type: 'object',
            properties: {
              header: {
                type: 'object',
                properties: {
                  titleKey: { type: 'string' },
                  iconClass: { type: 'string' }
                }
              },
              sections: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    titleKey: { type: 'string' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          labelKey: { type: 'string' },
                          href: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              },
              footerLinks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    labelKey: { type: 'string' },
                    href: { type: 'string' }
                  }
                }
              }
            }
          },
          model: {
            header: {
              titleKey: 'menu-admin',
              iconClass: 'fa fa-cog'
            },
            sections: [],
            footerLinks: []
          }
        };
      }
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
        },
        model: {
          enabled: true,
          title: '',
          message: ''
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
