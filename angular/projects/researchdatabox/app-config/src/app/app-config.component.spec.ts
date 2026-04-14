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
import { FigshareBindingEditorTypeComponent } from './fieldTypes/figshare-binding-editor';
import { FigshareCategoryMappingEditorTypeComponent } from './fieldTypes/figshare-category-mapping-editor';

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
        HomePanelsEditorTypeComponent,
        FigshareBindingEditorTypeComponent,
        FigshareCategoryMappingEditorTypeComponent
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
            { name: 'home-panels-editor', component: HomePanelsEditorTypeComponent },
            { name: 'figshare-binding-editor', component: FigshareBindingEditorTypeComponent },
            { name: 'figshare-category-mapping-editor', component: FigshareCategoryMappingEditorTypeComponent }
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

  it('uses figshare custom editors from schema widgets', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    app.configKey = 'figsharePublishing';

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();

    const titleField = findFieldByKey(app.fields, 'title');
    const mappingTableField = findFieldByKey(app.fields, 'mappingTable');

    expect(titleField?.type).toBe('figshare-binding-editor');
    expect(mappingTableField?.type).toBe('figshare-category-mapping-editor');
  });

  it('renders doiPublishing profiles as an editable array', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    app.configKey = 'doiPublishing';

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(Array.isArray((app.model as any).profiles)).toBeTrue();
    expect((app.model as any).profiles.length).toBe(1);
    expect((app.model as any).profiles[0].name).toBe('dataPublication');

    const profilesField = findFieldByKey(app.fields, 'profiles');
    const retryField = findFieldByKey(app.fields, 'retry');
    const migrationField = findFieldByKey(app.fields, 'migration');
    const bindingField = findFieldByKey(app.fields, 'url');

    expect(profilesField?.fieldArray).toBeTruthy();
    expect(retryField).toBeTruthy();
    expect(migrationField).toBeTruthy();
    expect(bindingField?.type).toBe('figshare-binding-editor');

    app.onSubmit(app.model);
    await fixture.whenStable();

    expect(appConfigService.lastSavedModel).toBe(app.model);
    expect(appConfigService.lastSavedModel.profiles[0].name).toBe('dataPublication');
  });

  it('shows the DOI field key on binding editors', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    app.configKey = 'doiPublishing';

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.debugElement.nativeElement;
    expect(compiled.textContent).toContain('publicationYear');
    expect(compiled.textContent).toContain('DOI FIELD');
  });

});

export function getStubAppConfigService(recordData: any = {}) {

  return {
    lastSavedModel: undefined as any,
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
      if (configKey === 'figsharePublishing') {
        return {
          fieldOrder: ['metadata', 'categories'],
          schema: {
            type: 'object',
            properties: {
              metadata: {
                type: 'object',
                properties: {
                  title: {
                    type: 'object',
                    widget: {
                      formlyConfig: {
                        type: 'figshare-binding-editor'
                      }
                    }
                  }
                }
              },
              categories: {
                type: 'object',
                properties: {
                  mappingTable: {
                    type: 'array',
                    widget: {
                      formlyConfig: {
                        type: 'figshare-category-mapping-editor'
                      }
                    }
                  }
                }
              }
            }
          },
          model: {
            metadata: {
              title: { kind: 'path', path: 'metadata.title' }
            },
            categories: {
              mappingTable: []
            }
          }
        };
      }
      if (configKey === 'doiPublishing') {
        return {
          fieldOrder: ['enabled', 'defaultProfile', 'connection', 'operations', 'profiles', 'migration'],
          schema: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              defaultProfile: { type: 'string' },
              connection: {
                type: 'object',
                properties: {
                  baseUrl: { type: 'string' },
                  username: { type: 'string' },
                  password: { type: 'string' },
                  timeoutMs: { type: 'number' },
                  retry: {
                    type: 'object',
                    properties: {
                      maxAttempts: { type: 'number' },
                      baseDelayMs: { type: 'number' },
                      maxDelayMs: { type: 'number' },
                      retryOnStatusCodes: {
                        type: 'array',
                        items: { type: 'number' }
                      },
                      retryOnMethods: {
                        type: 'array',
                        items: { type: 'string' }
                      }
                    }
                  }
                }
              },
              operations: {
                type: 'object',
                properties: {
                  createEvent: { type: 'string' },
                  updateEvent: { type: 'string' },
                  allowDeleteDraft: { type: 'boolean' },
                  allowStateChange: { type: 'boolean' }
                }
              },
              profiles: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    enabled: { type: 'boolean' },
                    label: { type: 'string' },
                    metadata: {
                      type: 'object',
                      properties: {
                        url: {
                          type: 'object',
                          widget: {
                            formlyConfig: {
                              type: 'figshare-binding-editor'
                            }
                          }
                        },
                        publicationYear: {
                          type: 'object',
                          widget: {
                            formlyConfig: {
                              type: 'figshare-binding-editor'
                            }
                          }
                        },
                        publisher: {
                          type: 'object',
                          widget: {
                            formlyConfig: {
                              type: 'figshare-binding-editor'
                            }
                          }
                        },
                        creators: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              sourcePath: { type: 'string' },
                              itemMode: { type: 'string' },
                              name: {
                                type: 'object',
                                widget: {
                                  formlyConfig: {
                                    type: 'figshare-binding-editor'
                                  }
                                }
                              }
                            }
                          }
                        },
                        titles: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              title: {
                                type: 'object',
                                widget: {
                                  formlyConfig: {
                                    type: 'figshare-binding-editor'
                                  }
                                }
                              }
                            }
                          }
                        },
                        types: {
                          type: 'object',
                          properties: {
                            resourceTypeGeneral: {
                              type: 'object',
                              widget: {
                                formlyConfig: {
                                  type: 'figshare-binding-editor'
                                }
                              }
                            }
                          }
                        }
                      }
                    },
                    writeBack: {
                      type: 'object',
                      properties: {
                        citationUrlPath: { type: 'string' },
                        citationDoiPath: { type: 'string' }
                      }
                    },
                    validation: {
                      type: 'object',
                      properties: {
                        requireUrl: { type: 'boolean' },
                        requirePublisher: { type: 'boolean' },
                        requirePublicationYear: { type: 'boolean' },
                        requireCreators: { type: 'boolean' },
                        requireTitles: { type: 'boolean' }
                      }
                    }
                  }
                }
              },
              migration: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  requiresTemplateReview: { type: 'boolean' },
                  migratedAt: { type: 'string' },
                  notes: {
                    type: 'array',
                    items: { type: 'string' }
                  }
                }
              }
            }
          },
          model: {
            enabled: true,
            defaultProfile: 'dataPublication',
            connection: {
              baseUrl: 'https://api.test.datacite.org',
              username: 'user',
              password: 'password',
              timeoutMs: 30000,
              retry: {
                maxAttempts: 3,
                baseDelayMs: 500,
                maxDelayMs: 4000,
                retryOnStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnMethods: ['get', 'put', 'patch', 'delete']
              }
            },
            operations: {
              createEvent: 'publish',
              updateEvent: 'publish',
              allowDeleteDraft: true,
              allowStateChange: true
            },
            profiles: [
              {
                name: 'dataPublication',
                enabled: true,
                label: 'Data Publication',
                metadata: {
                  url: { kind: 'path', path: 'record.metadata.url' },
                  publicationYear: { kind: 'path', path: 'record.metadata.year' },
                  publisher: { kind: 'path', path: 'record.metadata.publisher' },
                  creators: [{
                    sourcePath: 'metadata.creators',
                    itemMode: 'array',
                    name: { kind: 'path', path: 'item.name' }
                  }],
                  titles: [{
                    title: { kind: 'path', path: 'record.metadata.title' }
                  }],
                  types: {
                    resourceTypeGeneral: { kind: 'path', path: 'record.metadata.type' }
                  }
                },
                writeBack: {
                  citationUrlPath: 'metadata.citation_url',
                  citationDoiPath: 'metadata.citation_doi'
                },
                validation: {
                  requireUrl: true,
                  requirePublisher: true,
                  requirePublicationYear: true,
                  requireCreators: true,
                  requireTitles: true
                }
              }
            ],
            migration: {
              source: 'none',
              requiresTemplateReview: false,
              migratedAt: '',
              notes: []
            }
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
      this.lastSavedModel = model;
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
