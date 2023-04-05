import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { ManageUsersComponent } from './manage-users.component';

@NgModule({
  declarations: [
    ManageUsersComponent
  ],
  imports: [
    BrowserModule
  ],
  providers: [],
  bootstrap: [ManageUsersComponent]
})
export class ManageUsersModule { }
