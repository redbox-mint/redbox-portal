import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { inject, NgModule, provideAppInitializer } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ConfigService } from '../../../portal-ng-common/src/lib/config.service';
import { CsrfInterceptor } from '../../../portal-ng-common/src/lib/csrf.interceptor';
import { LoggerService } from '../../../portal-ng-common/src/lib/logger.service';
import { TranslationService } from '../../../portal-ng-common/src/lib/translation.service';
import { UtilityService } from '../../../portal-ng-common/src/lib/utility.service';
import { AdminAiModelsComponent } from './admin-ai-models.component';

@NgModule({
  imports: [BrowserModule, HttpClientModule, AdminAiModelsComponent],
  providers: [
    // Keep the translated server header until client translations are ready.
    provideAppInitializer(() => inject(TranslationService).waitForInit()),
    ConfigService, TranslationService, LoggerService, UtilityService,
    { provide: HTTP_INTERCEPTORS, useClass: CsrfInterceptor, multi: true },
    { provide: APP_BASE_HREF, useFactory: (s: PlatformLocation) => s.getBaseHrefFromDOM().replace(/\/$/, ''), deps: [PlatformLocation] }],
})
export class AdminAiModelsModule {}
