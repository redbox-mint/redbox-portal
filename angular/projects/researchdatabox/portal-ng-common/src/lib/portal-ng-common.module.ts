import { AdminSaveShortcutComponent } from './admin-save-shortcut.component';
import { AdminPagerComponent } from './admin-pager.component';
import { AdminListFooterComponent } from './admin-list-footer.component';
import { AdminDiscardDialogComponent } from './admin-discard-dialog.component';
import { AdminOverflowDirective } from './admin-overflow.directive';
import { AdminModalDirective } from './admin-modal.directive';
import { A11yModule } from '@angular/cdk/a11y';
import { NgModule } from '@angular/core';
import { AdminAutoFilterDirective } from './admin-auto-filter.directive';
import { AdminTabsDirective } from './admin-tabs.directive';
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
import { PlainTextLabelPipe } from './plain-text-label.pipe';
import { AdminCountPipe } from './admin-count.pipe';
import { AdminDatePipe } from './admin-date.pipe';
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
    // Root components wait for TranslationService through their dependencies.
    // A module initializer would prevent those roots from rendering recovery UI
    // when config or translation bootstrap rejects.
    ReportService
  ],
  imports: [
    AdminSaveShortcutComponent,
    AdminListFooterComponent,
    AdminPagerComponent,
    AdminModalDirective,
    AdminOverflowDirective,
    AdminDiscardDialogComponent,
    A11yModule,
    BrowserModule,
    HttpClientModule,
    FormsModule,
    AdminTabsDirective,
    AdminAutoFilterDirective,
    I18NextPipe,
    PlainTextLabelPipe,
    AdminDatePipe,
    AdminCountPipe,
    PaginationModule.forRoot()
  ],
  exports: [
    AdminSaveShortcutComponent,
    AdminListFooterComponent,
    AdminPagerComponent,
    AdminModalDirective,
    AdminOverflowDirective,
    AdminDiscardDialogComponent,
    A11yModule,
    AdminTabsDirective,
    AdminAutoFilterDirective,
    I18NextPipe,
    PlainTextLabelPipe,
    AdminDatePipe,
    AdminCountPipe,
    PaginationModule,
    RecordTableComponent,
    HeaderSortComponent,
  ]
})
export class RedboxPortalCoreModule { }
