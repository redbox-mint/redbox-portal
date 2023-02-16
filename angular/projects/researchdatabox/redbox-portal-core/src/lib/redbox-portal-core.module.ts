import { NgModule, APP_INITIALIZER, LOCALE_ID } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import * as _ from 'lodash';

import { I18NextModule } from 'angular-i18next';

import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { CsrfInterceptor } from './csrf.interceptor';
import { UserService } from './user.service';
import { LoggerService } from './logger.service';
import { TranslationService  } from './translation.service';
import { RecordService  } from './record.service';

function trimLastSlashFromUrl(baseUrl: string) {
  if (!_.isEmpty(baseUrl) && (baseUrl[baseUrl.length - 1] == '/')) {
    var trimmedUrl = baseUrl.substring(0, baseUrl.length - 1);
    return trimmedUrl;
  }
  return baseUrl;
}

@NgModule({
  declarations: [
  ],
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
    {
      provide: HTTP_INTERCEPTORS,
      useClass: CsrfInterceptor,
      multi: true
    },
    UserService,
    RecordService
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    I18NextModule.forRoot()
  ],
  exports: [
    I18NextModule
  ]
})
export class RedboxPortalCoreModule { }
