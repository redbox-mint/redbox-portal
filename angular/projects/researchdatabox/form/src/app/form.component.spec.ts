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
import { APP_BASE_HREF } from '@angular/common'; 
import { ReactiveFormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { FormComponent } from './form.component';
import { RedboxPortalCoreModule, UtilityService, LoggerService, TranslationService, ConfigService, getStubConfigService, getStubTranslationService, FormConfig } from '@researchdatabox/portal-ng-common';
import { TextFieldComponent } from './component/textfield.component';

describe('FormComponent', () => {
  let configService:any;
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
        TextFieldComponent
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
  
  it('should render TextField component correctly in the DOM', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    formComponent.downloadAndCreateOnInit = false; 
    
    await fixture.whenStable();
    fixture.detectChanges();

    const formConfig: FormConfig = {
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: { 
            name: 'text_1_for_the_form',
            class: 'TextFieldModel',
            config: {
              value: 'hello world!',
              defaultValue: 'hello world!'
            }
          },
          component: {
            class: 'TextFieldComponent'
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
    const inputElement = compiled.querySelector('input[type="text"]');
    expect(inputElement).toBeTruthy();
  });

});
