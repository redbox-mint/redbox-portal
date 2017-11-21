import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {ReactiveFormsModule, FormsModule} from "@angular/forms";
import { HttpModule } from '@angular/http';
import { ModalModule } from 'ngx-bootstrap';

import { AppComponent }  from './app.component';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  imports:      [ BrowserModule, HttpModule, ReactiveFormsModule, FormsModule, SharedModule, ModalModule.forRoot() ],
  declarations: [ AppComponent ],
  providers:    [ ],
  bootstrap:    [ AppComponent ]
})
export class AppModule { }
