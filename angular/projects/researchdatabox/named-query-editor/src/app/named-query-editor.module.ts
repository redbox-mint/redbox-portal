import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF, PlatformLocation, CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';

import { NamedQueryEditorComponent } from './named-query-editor.component';
import { NamedQueryApiService } from './named-query-api.service';
import { NqListComponent } from './nq-list/nq-list.component';
import { NqDetailComponent } from './nq-detail/nq-detail.component';
import { QueryParamEditorComponent } from './query-param-editor/query-param-editor.component';
import { ResultMappingEditorComponent } from './result-mapping-editor/result-mapping-editor.component';
import { SortEditorComponent } from './sort-editor/sort-editor.component';
import { MongoQueryEditorComponent } from './mongo-query-editor/mongo-query-editor.component';
import { RelatedFilterEditorComponent } from './related-filter-editor/related-filter-editor.component';

@NgModule({
  declarations: [
    NamedQueryEditorComponent,
    NqListComponent,
    NqDetailComponent,
    QueryParamEditorComponent,
    ResultMappingEditorComponent,
    SortEditorComponent,
    MongoQueryEditorComponent,
    RelatedFilterEditorComponent
  ],
  imports: [
    BrowserModule,
    A11yModule,
    FormsModule,
    RedboxPortalCoreModule,
    CommonModule
  ],
  providers: [
    NamedQueryApiService,
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    }
  ],
  bootstrap: [NamedQueryEditorComponent]
})
export class NamedQueryEditorModule {}
