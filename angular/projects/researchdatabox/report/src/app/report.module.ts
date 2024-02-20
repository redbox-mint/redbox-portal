import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from "@angular/forms";
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { ReportComponent } from './report.component';

@NgModule({
  declarations: [
    ReportComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    BrowserAnimationsModule,
    RedboxPortalCoreModule,
    BsDatepickerModule.forRoot(),
    PaginationModule.forRoot()
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
