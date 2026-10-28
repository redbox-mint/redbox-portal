import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { EmailTemplatesComponent } from './email-templates.component';

@NgModule({
  imports: [BrowserModule, FormsModule, RedboxPortalCoreModule, EmailTemplatesComponent],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation],
    },
  ],
  bootstrap: [EmailTemplatesComponent],
})
export class EmailTemplatesModule {}
