import { RedboxPortalAdminModule } from '@researchdatabox/portal-ng-common';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from "@angular/forms";
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { RedboxPortalCoreServicesModule, RedboxPortalRecordsModule, RedboxPortalRecordTableModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { DeletedRecordsComponent } from './deleted-records.component';
import { A11yModule } from '@angular/cdk/a11y';

@NgModule({
  declarations: [
    DeletedRecordsComponent
  ],
  imports: [RedboxPortalAdminModule,
    BrowserModule,
    FormsModule,
    BrowserAnimationsModule,
    RedboxPortalCoreServicesModule,
    RedboxPortalRecordsModule,
    RedboxPortalRecordTableModule,
    BsDatepickerModule,
    PaginationModule,
    A11yModule,
  ],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    }
  ],
  bootstrap: [DeletedRecordsComponent]
})
export class DeletedRecordsModule { }
