import { NgModule, APP_INITIALIZER, LOCALE_ID } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { FormsModule } from "@angular/forms";
import { isEmpty as _isEmpty } from 'lodash-es';

import { I18NextModule } from 'angular-i18next';
import { PaginationModule } from 'ngx-bootstrap/pagination';

import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { CsrfInterceptor } from './csrf.interceptor';
import { UserService } from './user.service';
import { LoggerService } from './logger.service';
import { RecordService } from './record.service';
import { TranslationService  } from './translation.service';
import { RecordTableComponent } from './record-table.component';
import { ReportService } from './report.service';

export function trimLastSlashFromUrl(baseUrl: string) {
  if (!_isEmpty(baseUrl) && (baseUrl[baseUrl.length - 1] == '/')) {
    var trimmedUrl = baseUrl.substring(0, baseUrl.length - 1);
    return trimmedUrl;
  }
  return baseUrl;
}

@NgModule({
  declarations: [
    RecordTableComponent
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
    RecordService,
    ReportService
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    I18NextModule.forRoot(),
    PaginationModule.forRoot()
  ],
  exports: [
    I18NextModule,
    PaginationModule,
    RecordTableComponent
  ]
})
export class RedboxPortalCoreModule { }
