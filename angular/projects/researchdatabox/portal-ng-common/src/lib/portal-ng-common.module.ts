import { NgModule, inject, provideAppInitializer } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { FormsModule } from "@angular/forms";
import { isEmpty as _isEmpty } from 'lodash-es';

import { PaginationModule } from 'ngx-bootstrap/pagination';

import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { AppConfigService } from './appconfig.service';
import { CsrfInterceptor } from './csrf.interceptor';
import { UserService } from './user.service';
import { LoggerService } from './logger.service';
import { RecordService } from './record.service';
import { TranslationService } from './translation.service';
import { RecordTableComponent } from './record-table.component';
import { ReportService } from './report.service';
import { HeaderSortComponent } from "./header-sort.component";
import { I18NextPipe } from './i18next.pipe';
export function trimLastSlashFromUrl(baseUrl: string) {
  if (!_isEmpty(baseUrl) && (baseUrl[baseUrl.length - 1] == '/')) {
    var trimmedUrl = baseUrl.substring(0, baseUrl.length - 1);
    return trimmedUrl;
  }
  return baseUrl;
}

@NgModule({
  declarations: [
    RecordTableComponent,
    HeaderSortComponent
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
    AppConfigService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: CsrfInterceptor,
      multi: true
    },
    UserService,
    RecordService,
    ReportService,
    provideAppInitializer(() => inject(TranslationService).waitForInit())
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    I18NextPipe,
    PaginationModule.forRoot()
  ],
  exports: [
    I18NextPipe,
    PaginationModule,
    RecordTableComponent,
    HeaderSortComponent,
  ]
})
export class RedboxPortalCoreModule { }
