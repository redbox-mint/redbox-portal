import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from "@angular/forms";
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { RedboxPortalCoreServicesModule, RedboxPortalReportsModule, RedboxPortalRecordTableModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { ReportComponent } from './report.component';

@NgModule({
  declarations: [
    ReportComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    BrowserAnimationsModule,
    RedboxPortalCoreServicesModule,
    RedboxPortalReportsModule,
    RedboxPortalRecordTableModule,
    BsDatepickerModule,
    PaginationModule
  ],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    }
  ],
  bootstrap: [ReportComponent]
})
export class ReportModule { }
