import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ConfigService, CsrfInterceptor, LoggerService, TranslationService, UtilityService, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { AdminAiModelsComponent } from './admin-ai-models.component';

@NgModule({
  imports: [BrowserModule, HttpClientModule, AdminAiModelsComponent],
  providers: [ConfigService, TranslationService, LoggerService, UtilityService,
    { provide: HTTP_INTERCEPTORS, useClass: CsrfInterceptor, multi: true },
    { provide: APP_BASE_HREF, useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()), deps: [PlatformLocation] }],
  bootstrap: [AdminAiModelsComponent],
})
export class AdminAiModelsModule {}
