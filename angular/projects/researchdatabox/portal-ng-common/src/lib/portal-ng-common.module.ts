import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RedboxPortalCoreServicesModule } from './portal-core-services.module';
import { RedboxPortalRecordsModule } from './portal-records.module';
import { RedboxPortalRecordTableModule } from './portal-record-table.module';
import { RedboxPortalReportsModule } from './portal-reports.module';

export { trimLastSlashFromUrl } from './portal-core-services.module';

/**
 * Compatibility module for existing portal forms and custom hooks.
 * New apps can import RedboxPortalCoreServicesModule and only the features they use.
 */
@NgModule({
  imports: [
    BrowserModule,
    RedboxPortalCoreServicesModule,
    RedboxPortalRecordsModule,
    RedboxPortalRecordTableModule,
    RedboxPortalReportsModule
  ],
  exports: [RedboxPortalCoreServicesModule, RedboxPortalRecordTableModule]
})
export class RedboxPortalCoreModule {}
