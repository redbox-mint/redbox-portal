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
import { NgModule, isDevMode } from '@angular/core';
import { BrowserModule, Title } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ReactiveFormsModule } from '@angular/forms';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { CommonModule, APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { FormComponent } from './form.component';
import { SimpleInputComponent } from './component/simple-input.component';
import { FormService } from './form.service';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './component/repeatable.component';
import { ValidationSummaryFieldComponent } from './component/validation-summary.component';
import { I18NextPipe, provideI18Next } from 'angular-i18next';
import { GroupFieldComponent } from './component/group.component';
import { DefaultLayoutComponent } from './component/default-layout.component';
import { InlineLayoutComponent } from './component/inline-layout.component';
import { FormBaseWrapperComponent } from './component/base-wrapper.component';
import { FormBaseWrapperDirective } from './component/base-wrapper.directive';
import { ContentComponent } from './component/content.component';
import { SaveButtonComponent } from './component/save-button.component';
import { CancelButtonComponent } from './component/cancel-button.component';
import { TabNavButtonComponent } from './component/tab-nav-button.component';
import { TabComponent, TabComponentLayout, TabContentComponent } from './component/tab.component';
import { TextAreaComponent } from './component/text-area.component';
import { DropdownInputComponent } from './component/dropdown-input.component';
import { CheckboxInputComponent } from './component/checkbox-input.component';
import { RadioInputComponent } from './component/radio-input.component';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideFormFeature } from './form-state';
import { FormStateFacade } from './form-state/facade/form-state.facade';
import { FormComponentEventBus } from './form-state/events/form-component-event-bus.service';
import { DateInputComponent } from './component/date-input.component';
import { CheckboxTreeComponent } from './component/checkbox-tree.component';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { TypeaheadModule } from 'ngx-bootstrap/typeahead';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { TypeaheadInputComponent } from './component/typeahead-input.component';
import { RichTextEditorComponent } from './component/rich-text-editor.component';
import { TiptapEditorDirective } from 'ngx-tiptap';
import { MapComponent } from './component/map.component';
import { FileUploadComponent } from './component/file-upload.component';
import { A11yModule } from '@angular/cdk/a11y';
@NgModule({
  declarations: [
    DefaultLayoutComponent,
    InlineLayoutComponent,
    FormBaseWrapperComponent,
    FormBaseWrapperDirective,
    FormComponent,
    SimpleInputComponent,
    ContentComponent,
    TextAreaComponent,
    RepeatableComponent,
    RepeatableElementLayoutComponent,
    ValidationSummaryFieldComponent,
    GroupFieldComponent,
    SaveButtonComponent,
    CancelButtonComponent,
    TabNavButtonComponent,
    TabComponent,
    TabContentComponent,
    TabComponentLayout,
    DropdownInputComponent,
    CheckboxInputComponent,
    RadioInputComponent,
    DateInputComponent,
    CheckboxTreeComponent,
    TypeaheadInputComponent,
    RichTextEditorComponent,
    MapComponent,
    FileUploadComponent,
  ],
  imports: [
    CommonModule,
    BrowserModule,
    ReactiveFormsModule,
    RedboxPortalCoreModule,
    I18NextPipe,
    BrowserAnimationsModule,
    TiptapEditorDirective,
    BsDatepickerModule.forRoot(),
    TypeaheadModule.forRoot(),
    A11yModule,
  ],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation],
    },
    Title,
    FormService,
    FormStateFacade,
    FormComponentEventBus,
    provideStore(),
    provideEffects(),
    provideFormFeature(),
    provideI18Next(),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
  ],
  bootstrap: [FormComponent],
  exports: [],
})
export class FormModule { }
