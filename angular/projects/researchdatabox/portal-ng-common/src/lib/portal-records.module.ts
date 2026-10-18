import { NgModule } from '@angular/core';
import { RecordService } from './record.service';

/** Optional record API providers; import alongside RedboxPortalCoreServicesModule. */
@NgModule({ providers: [RecordService] })
export class RedboxPortalRecordsModule {}
