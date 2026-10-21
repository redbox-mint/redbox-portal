import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from "@angular/forms";
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { RedboxPortalCoreServicesModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import {ModalModule} from "ngx-bootstrap/modal";
import { BrandingAdminComponent } from './branding-admin.component';

@NgModule({
  declarations: [
    
  ],
  imports: [
    BrowserModule,
    FormsModule,
    BrowserAnimationsModule,
    RedboxPortalCoreServicesModule,
    BsDatepickerModule,
    ModalModule,
    BrandingAdminComponent
  ],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    }
  ],
  bootstrap: [BrandingAdminComponent]
})
export class BrandingAdminModule { }
