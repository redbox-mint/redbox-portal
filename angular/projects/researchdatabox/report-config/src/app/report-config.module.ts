import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { ReportConfigComponent } from './report-config.component';
import { ReportConfigService } from './report-config.service';

@NgModule({
  declarations: [ReportConfigComponent],
  imports: [
    BrowserModule,
    FormsModule,
    HttpClientModule,
    RedboxPortalCoreModule
  ],
  providers: [
    ReportConfigService,
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    }
  ],
  bootstrap: [ReportConfigComponent]
})
export class ReportConfigModule { }
