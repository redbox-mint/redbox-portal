import { NgModule, APP_INITIALIZER, LOCALE_ID } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import * as _ from 'lodash';

import { I18NextModule } from 'angular-i18next';

import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { AuthInterceptor } from './auth.interceptor';
import { UserService } from './user.service';
import { LoggerService } from './logger.service';

function trimLastSlashFromUrl(baseUrl: string) {
  if (!_.isEmpty(baseUrl) && (baseUrl[baseUrl.length - 1] == '/')) {
    var trimmedUrl = baseUrl.substring(0, baseUrl.length - 1);
    return trimmedUrl;
  }
  return null;
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
    LoggerService,
    UtilityService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    },
    UserService
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    I18NextModule.forRoot()
  ],
  exports: [

  ]
})
export class RedboxPortalCoreModule { }
