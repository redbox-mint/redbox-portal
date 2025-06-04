// Copyright (c) 2023 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
import {APP_BASE_HREF} from '@angular/common';
import {ReactiveFormsModule} from '@angular/forms';
import {TestBed} from '@angular/core/testing';

import {
  ConfigService,
  FormConfig,
  getStubConfigService,
  getStubTranslationService,
  LoggerService,
  RedboxPortalCoreModule,
  TranslationService,
  UtilityService
} from '@researchdatabox/portal-ng-common';
import { FormComponent } from '../form.component';
import { TextFieldComponent } from './textfield.component';
import {GroupFieldComponent} from "./groupfield.component";


describe('FormComponent', () => {
  let configService: any;
  let translationService: any;
  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService();
    await TestBed.configureTestingModule({
      imports: [
        ReactiveFormsModule,
        RedboxPortalCoreModule
      ],
      declarations: [
        FormComponent,
        TextFieldComponent,
        GroupFieldComponent,
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
        }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(FormComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the group and child components', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    formComponent.downloadAndCreateOnInit = false;

    await fixture.whenStable();
    fixture.detectChanges();

    const formConfig: FormConfig = {
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          // first group component
          name: 'group_1_component',
          layout: {
            class: 'DefaultLayoutComponent',
            config: {
              label: 'GroupField label',
              helpText: 'GroupField help',
            }
          },
          model: {
            name: 'group_1_model',
            class: 'GroupFieldModel',
            config: {
              defaultValue: {},
            }
          },
          component: {
            class: 'GroupFieldComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'text_3',
                  layout: {
                    class: 'DefaultLayoutComponent',
                    config: {
                      label: 'TextField with default wrapper defined',
                      helpText: 'This is a help text',
                    }
                  },
                  model: {
                    class: 'TextFieldModel',
                    config: {
                      value: 'hello world 3!',
                    }
                  },
                  component: {
                    class: 'TextFieldComponent'
                  }
                },
                {
                  name: 'text_4',
                  model: {
                    class: 'TextFieldModel',
                    config: {
                      value: 'hello world 4!',
                      defaultValue: 'hello world 4!'
                    }
                  },
                  component: {
                    class: 'TextFieldComponent'
                  }
                },
                {
                  // second group component, nested in first group component
                  name: 'group_2_component',
                  layout: {
                    class: 'DefaultLayoutComponent',
                    config: {
                      label: 'GroupField 2 label',
                      helpText: 'GroupField 2 help',
                    }
                  },
                  model: {
                    name: 'group_2_model',
                    class: 'GroupFieldModel',
                    config: {
                      defaultValue: {},
                    }
                  },
                  component: {
                    class: 'GroupFieldComponent',
                    config: {
                      componentDefinitions: [
                        {
                          name: 'text_5',
                          layout: {
                            class: 'DefaultLayoutComponent',
                            config: {
                              label: 'TextField with default wrapper defined',
                              helpText: 'This is a help text',
                            }
                          },
                          model: {
                            class: 'TextFieldModel',
                            config: {
                              value: 'hello world 5!',
                            }
                          },
                          component: {
                            class: 'TextFieldComponent'
                          }
                        }
                      ]
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    };
    formComponent.downloadAndCreateFormComponents(formConfig);
    await fixture.whenStable();
    fixture.detectChanges();

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject('Timeout waiting for componentsLoaded'), 3000);
      const check = () => {
        fixture.detectChanges();
        if (formComponent.componentsLoaded()) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });

    fixture.detectChanges(); // Ensure DOM is updated
    console.log('Components Loaded:', formComponent.componentsLoaded());
    // Now run your expectations
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElements = compiled.querySelectorAll('input[type="text"]');
    expect(inputElements).toHaveSize(3);
  });

});
