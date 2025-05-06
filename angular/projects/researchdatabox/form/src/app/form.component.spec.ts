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
import { provideAppInitializer } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common'; 
import { TestBed } from '@angular/core/testing';
import { FormComponent } from './form.component';
import { UtilityService, LoggerService, TranslationService, ConfigService, ReportService, getStubConfigService, getStubTranslationService } from '@researchdatabox/portal-ng-common';

describe('FormComponent', () => {
  let configService:any;
  let translationService: any;
  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService();
    await TestBed.configureTestingModule({
      declarations: [
        FormComponent
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
  
  // it('should render TextField component correctly in the DOM', async () => {
  //   const fixture = TestBed.createComponent(FormComponent);
  //   const component = fixture.componentInstance;
    
  //   // Wait for component to initialize and load form components
  //   await fixture.whenStable();
  //   fixture.detectChanges();
    
  //   // Query for the input element that should be created by the TextFieldComponent
  //   const compiled = fixture.nativeElement as HTMLElement;
  //   const inputElement = compiled.querySelector('input[type="text"]');
    
  //   // Verify the input element exists
  //   expect(inputElement).toBeTruthy();
    
  //   // If you want to check specific properties of the TextField based on your config:
  //   // For example, checking if it has the correct value from the model
  //   // This assumes your FormComponent properly binds the TextFieldComponent and its model
  //   // expect(inputElement?.value).toBe('hello world!');
  // });

  // it(`should have as title '@researchdatabox/form'`, () => {
  //   const fixture = TestBed.createComponent(FormComponent);
  //   const app = fixture.componentInstance;
  //   expect(app.title).toEqual('@researchdatabox/form');
  // });

  // it('should render title', () => {
  //   const fixture = TestBed.createComponent(FormComponent);
  //   fixture.detectChanges();
  //   const compiled = fixture.nativeElement as HTMLElement;
  //   expect(compiled.querySelector('.content span')?.textContent).toContain('@researchdatabox/form app is running!');
  // });
});
