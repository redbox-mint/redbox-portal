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
import { NgModule } from '@angular/core';
import { BrowserModule, Title } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { FormComponent } from './form.component';
import { TextFieldComponent } from './component/textfield.component';
import { FormFieldWrapperDirective } from './form-field-wrapper.directive';
import { FormService } from './form.service';
import { FormFieldWrapperComponent } from './form-field-wrapper.component';
@NgModule({
  declarations: [
    FormComponent,
    FormFieldWrapperComponent,
    FormFieldWrapperDirective,
    TextFieldComponent
  ],
  imports: [
    BrowserModule,
    ReactiveFormsModule,
    RedboxPortalCoreModule
  ],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    },
    Title,
    FormService
  ],
  bootstrap: [FormComponent],
  exports: [
    
  ]
})
export class FormModule { }
