import { NgModule, inject, provideAppInitializer } from '@angular/core';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { isEmpty as _isEmpty } from 'lodash-es';

import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { AppConfigService } from './appconfig.service';
import { CsrfInterceptor } from './csrf.interceptor';
import { UserService } from './user.service';
import { LoggerService } from './logger.service';
import { TranslationService } from './translation.service';
import { I18NextPipe } from './i18next.pipe';

export function trimLastSlashFromUrl(baseUrl: string) {
  if (!_isEmpty(baseUrl) && (baseUrl[baseUrl.length - 1] == '/')) {
    var trimmedUrl = baseUrl.substring(0, baseUrl.length - 1);
    return trimmedUrl;
  }
  return baseUrl;
}

/** Root providers and translation pipe shared by the embedded portal apps. */
@NgModule({
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    },
    ConfigService,
    TranslationService,
    LoggerService,
    UtilityService,
    AppConfigService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: CsrfInterceptor,
      multi: true
    },
    UserService,
    provideAppInitializer(() => inject(TranslationService).waitForInit())
  ],
  imports: [
    HttpClientModule,
    I18NextPipe
  ],
  exports: [
    I18NextPipe,
  ]
})
export class RedboxPortalCoreServicesModule { }
