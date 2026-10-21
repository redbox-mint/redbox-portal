import { NgModule } from '@angular/core';
import { ReportService } from './report.service';

/** Optional report API providers; import alongside RedboxPortalCoreServicesModule. */
@NgModule({ providers: [ReportService] })
export class RedboxPortalReportsModule {}
