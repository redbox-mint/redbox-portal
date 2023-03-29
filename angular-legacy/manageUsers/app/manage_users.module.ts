import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {ReactiveFormsModule, FormsModule} from "@angular/forms";
import { HttpModule } from '@angular/http';
import { ModalModule } from 'ngx-bootstrap';

import { ManageUsersComponent }  from './manage_users.component';
import { SharedModule } from './shared/shared.module';
import * as $ from 'jquery';

@NgModule({
  imports:      [ BrowserModule, HttpModule, ReactiveFormsModule, FormsModule, SharedModule, ModalModule.forRoot() ],
  declarations: [ ManageUsersComponent ],
  providers:    [ ],
  bootstrap:    [ ManageUsersComponent ]
})
export class ManageUsersModule { }
