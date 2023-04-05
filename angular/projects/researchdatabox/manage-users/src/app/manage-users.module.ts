import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from "@angular/forms";
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/redbox-portal-core';
import { ManageUsersComponent } from './manage-users.component';

@NgModule({
  declarations: [
    ManageUsersComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    BrowserAnimationsModule,
    RedboxPortalCoreModule
  ],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    }
  ],
  bootstrap: [ManageUsersComponent]
})
export class ManageUsersModule { }
