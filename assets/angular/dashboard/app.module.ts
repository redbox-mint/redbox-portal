import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {ReactiveFormsModule, FormsModule} from "@angular/forms";
import { HttpModule } from '@angular/http';
import { AppComponent }  from './app.component';
import { UserSimpleService } from '../shared/user.service-simple';
import { DashboardService } from '../shared/dashboard-service';
import { PaginationModule,TooltipModule } from 'ngx-bootstrap';
import { ConfigService } from '../shared/config-service';
import { TranslateI18NextModule } from 'angular2-i18next';
import { TranslationService } from '../shared/translation-service';

@NgModule({
  imports:      [ BrowserModule, HttpModule, ReactiveFormsModule, FormsModule, PaginationModule.forRoot(), TooltipModule.forRoot(), TranslateI18NextModule ],
  declarations: [ AppComponent ],
  providers:    [ UserSimpleService, DashboardService, ConfigService, TranslationService],
  bootstrap:    [ AppComponent ]
})
export class AppModule { }
