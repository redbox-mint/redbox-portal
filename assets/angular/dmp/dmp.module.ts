// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule, FormsModule} from "@angular/forms";
import { HttpModule } from '@angular/http';
import { DmpFormComponent } from './dmp-form.component';
import { DmpFieldComponent } from './dmp-field.component';
import { FieldControlService } from '../shared/form/field-control.service';
import { RecordsService } from '../shared/form/records.service';
import { NKDatetimeModule } from 'ng2-datetime/ng2-datetime';
import { TextFieldComponent, DropdownFieldComponent, TabOrAccordionContainerComponent, TextBlockComponent, TextAreaComponent, DateTimeComponent, AnchorOrButtonComponent, HtmlRawComponent, HiddenValueComponent, LinkValueComponent } from '../shared/form/field-simple.component';
import { VocabField, VocabFieldComponent, VocabFieldLookupService } from '../shared/form/field-vocab.component';
import { RepeatableVocabComponent, RepeatableContributorComponent } from '../shared/form/field-repeatable.component';
import { ContributorComponent } from '../shared/form/field-contributor.component';
import { WorkflowStepButtonComponent } from '../shared/form/workflow-button.component';
import { Ng2CompleterModule } from "ng2-completer";
import { ConfigService } from '../shared/config-service';
@NgModule({
  imports:      [ BrowserModule, HttpModule, ReactiveFormsModule, NKDatetimeModule, FormsModule, Ng2CompleterModule ],
  declarations: [ DmpFormComponent, DmpFieldComponent, TextFieldComponent, DropdownFieldComponent, TabOrAccordionContainerComponent, TextBlockComponent, TextAreaComponent, DateTimeComponent, AnchorOrButtonComponent, VocabFieldComponent, RepeatableVocabComponent, ContributorComponent, RepeatableContributorComponent, HtmlRawComponent, HiddenValueComponent, WorkflowStepButtonComponent, LinkValueComponent ],
  providers:    [ FieldControlService, RecordsService, VocabFieldLookupService, ConfigService ],
  bootstrap:    [ DmpFormComponent ],
  entryComponents: [ TextFieldComponent, DropdownFieldComponent, TabOrAccordionContainerComponent, TextBlockComponent, TextAreaComponent, DateTimeComponent, AnchorOrButtonComponent, VocabFieldComponent, RepeatableVocabComponent, ContributorComponent, RepeatableContributorComponent, HtmlRawComponent, HiddenValueComponent, WorkflowStepButtonComponent, LinkValueComponent ]
})
export class DmpModule { }
