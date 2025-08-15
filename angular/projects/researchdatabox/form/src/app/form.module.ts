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
import { CommonModule, APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { FormComponent } from './form.component';
import { TextInputComponent } from './component/textfield.component';
import { FormService } from './form.service';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './component/repeatable.component';
import {ValidationSummaryFieldComponent} from "./component/validation-summary.component";
import {I18NextPipe, provideI18Next} from "angular-i18next";
import {GroupFieldComponent} from "./component/groupfield.component";
import {DefaultLayoutComponent} from "./component/default-layout.component";
import {FormBaseWrapperComponent} from "./component/base-wrapper.component";
import {FormBaseWrapperDirective} from "./component/base-wrapper.directive";
import { TextBlockComponent } from './component/textblock.component';
import {TabComponent, TabContentComponent} from "./component/tab.component";
@NgModule({
  declarations: [
    DefaultLayoutComponent,
    FormBaseWrapperComponent,
    FormBaseWrapperDirective,
    FormComponent,
    TextInputComponent,
    TextBlockComponent,
    RepeatableComponent,
    RepeatableElementLayoutComponent,
    ValidationSummaryFieldComponent,
    GroupFieldComponent,
    TabComponent,
    TabContentComponent,
  ],
  imports: [
    CommonModule,
    BrowserModule,
    ReactiveFormsModule,
    RedboxPortalCoreModule,
    I18NextPipe,
  ],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    },
    Title,
    FormService,
    provideI18Next(),
  ],
  bootstrap: [
    FormComponent
  ],
  exports: [

  ]
})
export class FormModule { }
