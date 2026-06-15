import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule, APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RedboxPortalCoreModule, trimLastSlashFromUrl, RecordAuditModule as LibRecordAuditModule } from '@researchdatabox/portal-ng-common';
import { RecordAuditComponent } from '@researchdatabox/portal-ng-common';

@NgModule({
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CommonModule,
    FormsModule,
    RedboxPortalCoreModule,
    LibRecordAuditModule,
  ],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation],
    },
  ],
  bootstrap: [RecordAuditComponent],
})
export class RecordAuditModule {}
