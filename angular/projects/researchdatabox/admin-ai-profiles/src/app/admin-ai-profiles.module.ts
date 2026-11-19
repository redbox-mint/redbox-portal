import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { inject, NgModule, provideAppInitializer } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ConfigService } from '@researchdatabox/portal-ng-common';
import { CsrfInterceptor } from '@researchdatabox/portal-ng-common';
import { LoggerService } from '@researchdatabox/portal-ng-common';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { UtilityService } from '@researchdatabox/portal-ng-common';
import { AdminAiProfilesComponent } from './admin-ai-profiles.component';

@NgModule({
  imports: [BrowserModule, HttpClientModule, AdminAiProfilesComponent],
  providers: [
    // Keep the translated server header until client translations are ready.
    provideAppInitializer(() => inject(TranslationService).waitForInit()),
    ConfigService, TranslationService, LoggerService, UtilityService,
    { provide: HTTP_INTERCEPTORS, useClass: CsrfInterceptor, multi: true },
    { provide: APP_BASE_HREF, useFactory: (s: PlatformLocation) => s.getBaseHrefFromDOM().replace(/\/$/, ''), deps: [PlatformLocation] }],
})
export class AdminAiProfilesModule {}
