import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {ReactiveFormsModule} from "@angular/forms";
import { HttpModule } from '@angular/http';
import { AppComponent }  from './app.component';
import { UserSimpleService } from '../shared/user.service-simple';
import { ConfigService } from '../shared/config-service';
import { TranslateI18NextModule } from 'angular2-i18next';

@NgModule({
  imports:      [ BrowserModule, HttpModule, ReactiveFormsModule, TranslateI18NextModule ],
  declarations: [ AppComponent ],
  providers: [ UserSimpleService, ConfigService ],
  bootstrap:    [ AppComponent ]
})
export class AppModule { }
