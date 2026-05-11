import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF, PlatformLocation, CommonModule } from '@angular/common';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';

import { DashboardConfigEditorComponent } from './dashboard-config-editor.component';
import { DashboardConfigApiService } from './dashboard-config-api.service';
import { TableConfigEditorComponent } from './table-config-editor/table-config-editor.component';
import { ColumnEditorComponent } from './column-editor/column-editor.component';
import { ColumnDetailComponent } from './column-editor/column-detail.component';
import { FormatRulesEditorComponent } from './format-rules-editor/format-rules-editor.component';
import { RuleSetEditorComponent } from './rule-set-editor/rule-set-editor.component';
import { RuleEditorComponent } from './rule-set-editor/rule-editor.component';
import { TemplatePreviewComponent } from './template-preview/template-preview.component';
import { TemplatePreviewService } from './template-preview/template-preview.service';
import { TableConfigPreviewComponent } from './table-config-preview/table-config-preview.component';

@NgModule({
  declarations: [
    DashboardConfigEditorComponent,
    TableConfigEditorComponent,
    TableConfigPreviewComponent,
    ColumnEditorComponent,
    ColumnDetailComponent,
    FormatRulesEditorComponent,
    RuleSetEditorComponent,
    RuleEditorComponent,
    TemplatePreviewComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    RedboxPortalCoreModule,
    CommonModule
  ],
  providers: [
    DashboardConfigApiService,
    TemplatePreviewService,
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    }
  ],
  bootstrap: [DashboardConfigEditorComponent]
})
export class DashboardConfigEditorModule {}
