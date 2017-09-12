import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule, FormsModule } from "@angular/forms";
import { HttpModule } from '@angular/http';
import { TransferOwnerComponent }  from './transfer_owner.component';
import { DashboardService } from '../shared/dashboard-service';
import { UserSimpleService } from '../shared/user.service-simple';
import { ConfigService } from '../shared/config-service';
import { TranslateI18NextModule } from 'angular2-i18next';
import { TranslationService } from '../shared/translation-service';
import { VocabFieldComponent, VocabFieldLookupService } from '../shared/form/field-vocab.component';
import { Ng2CompleterModule } from "ng2-completer";
import { RecordsService } from "../shared/form/records.service";
import { FieldControlService } from '../shared/form/field-control.service';

@NgModule({
  imports:      [ BrowserModule, HttpModule, ReactiveFormsModule, FormsModule, TranslateI18NextModule, Ng2CompleterModule ],
  declarations: [ TransferOwnerComponent, VocabFieldComponent ],
  providers:    [ UserSimpleService, ConfigService, TranslationService, DashboardService, VocabFieldLookupService, RecordsService, FieldControlService ],
  bootstrap:    [ TransferOwnerComponent, VocabFieldComponent ]
})
export class TransferOwnerModule { }
