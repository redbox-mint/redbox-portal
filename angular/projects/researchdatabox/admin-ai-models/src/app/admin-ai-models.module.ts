import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ConfigService } from 'projects/researchdatabox/portal-ng-common/src/lib/config.service';
import { CsrfInterceptor } from 'projects/researchdatabox/portal-ng-common/src/lib/csrf.interceptor';
import { LoggerService } from 'projects/researchdatabox/portal-ng-common/src/lib/logger.service';
import { TranslationService } from 'projects/researchdatabox/portal-ng-common/src/lib/translation.service';
import { UtilityService } from 'projects/researchdatabox/portal-ng-common/src/lib/utility.service';
import { AdminAiModelsComponent } from './admin-ai-models.component';

@NgModule({
  imports: [BrowserModule, HttpClientModule, AdminAiModelsComponent],
  providers: [ConfigService, TranslationService, LoggerService, UtilityService,
    { provide: HTTP_INTERCEPTORS, useClass: CsrfInterceptor, multi: true },
    { provide: APP_BASE_HREF, useFactory: (s: PlatformLocation) => s.getBaseHrefFromDOM().replace(/\/$/, ''), deps: [PlatformLocation] }],
  bootstrap: [AdminAiModelsComponent],
})
export class AdminAiModelsModule {}
