import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { APP_BASE_HREF, PlatformLocation, CommonModule } from '@angular/common';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { ModalModule } from 'ngx-bootstrap/modal';
import { ManageUsersComponent } from './manage-users.component';

@NgModule({
  declarations: [
    ManageUsersComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    ReactiveFormsModule,
    BrowserAnimationsModule,
    RedboxPortalCoreModule,
    CommonModule,
    ModalModule.forRoot()
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
