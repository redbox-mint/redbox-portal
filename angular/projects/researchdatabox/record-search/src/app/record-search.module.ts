import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';

import { RecordSearchComponent } from './record-search.component';
import { RecordSearchRefinerComponent } from './record-search-refiner/record-search-refiner.component';
import { SearchService } from './search.service';

@NgModule({
  declarations: [RecordSearchComponent, RecordSearchRefinerComponent],
  imports: [BrowserModule, FormsModule, RedboxPortalCoreModule, PaginationModule.forRoot()],
  providers: [
    SearchService,
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation],
    },
  ],
  bootstrap: [RecordSearchComponent],
})
export class RecordSearchModule {}
