import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import {
  AdminSidePanelComponent,
  AdminSourceCardComponent,
  ColumnsPanelComponent,
  AdminOverflowDirective,
  AutocompleteComponent,
  RedboxPortalCoreModule,
  trimLastSlashFromUrl,
} from '@researchdatabox/portal-ng-common';
import { ReportDiagnosticsComponent, ReportTemplateInputComponent } from './report-assistance.component';
import { ReportConfigComponent } from './report-config.component';
import { ReportConfigService } from './report-config.service';

@NgModule({
  declarations: [ReportConfigComponent],
  imports: [
    BrowserModule,
    A11yModule,
    FormsModule,
    HttpClientModule,
    RedboxPortalCoreModule,
    AdminSidePanelComponent,
    AdminSourceCardComponent,
    ColumnsPanelComponent,
    AdminOverflowDirective,
    AutocompleteComponent,
    ReportDiagnosticsComponent,
    ReportTemplateInputComponent,
  ],
  providers: [
    ReportConfigService,
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation],
    },
  ],
  bootstrap: [ReportConfigComponent],
})
export class ReportConfigModule {}
