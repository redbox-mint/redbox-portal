import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { ManageRolesComponent } from './manage-roles.component';

@NgModule({
  declarations: [
    ManageRolesComponent
  ],
  imports: [
    BrowserModule
  ],
  providers: [],
  bootstrap: [ManageRolesComponent]
})
export class ManageRolesModule { }
