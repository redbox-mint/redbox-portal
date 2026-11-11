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
import { RedboxPortalCoreServicesModule } from './portal-core-services.module';
import { RedboxPortalRecordsModule } from './portal-records.module';
import { RedboxPortalRecordTableModule } from './portal-record-table.module';
import { RedboxPortalReportsModule } from './portal-reports.module';

import { PaginationModule } from 'ngx-bootstrap/pagination';

import { FormsModule } from '@angular/forms';
import { I18NextPipe } from './i18next.pipe';
import { PlainTextLabelPipe } from './plain-text-label.pipe';
import { AdminCountPipe } from './admin-count.pipe';
import { AdminDatePipe } from './admin-date.pipe';
export { trimLastSlashFromUrl } from './portal-core-services.module';

/**
 * Compatibility module for existing portal forms and custom hooks.
 * New apps can import RedboxPortalCoreServicesModule and only the features they use.
 */
@NgModule({
  imports: [
    AdminSaveShortcutComponent,
    AdminListFooterComponent,
    AdminPagerComponent,
    AdminModalDirective,
    AdminOverflowDirective,
    AdminDiscardDialogComponent,
    A11yModule,
    BrowserModule,
    RedboxPortalCoreServicesModule,
    RedboxPortalRecordsModule,
    RedboxPortalRecordTableModule,
    RedboxPortalReportsModule,
    FormsModule,
    AdminTabsDirective,
    AdminAutoFilterDirective,
    I18NextPipe,
    PlainTextLabelPipe,
    AdminDatePipe,
    AdminCountPipe,
    PaginationModule
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
    RedboxPortalCoreServicesModule,
    RedboxPortalRecordTableModule,
  ]
})
export class RedboxPortalCoreModule {}
