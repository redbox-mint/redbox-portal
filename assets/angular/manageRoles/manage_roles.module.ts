import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {ReactiveFormsModule, FormsModule} from "@angular/forms";
import { HttpModule } from '@angular/http';
import { ManageRolesComponent }  from './manage_roles.component';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  imports:      [ BrowserModule, HttpModule, ReactiveFormsModule, FormsModule, SharedModule ],
  declarations: [ ManageRolesComponent ],
  providers:    [ ],
  bootstrap:    [ ManageRolesComponent ]
})
export class ManageRolesModule { }
