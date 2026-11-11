import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import { BrowserModule } from '@angular/platform-browser';
import { APP_BASE_HREF, PlatformLocation, CommonModule } from '@angular/common';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { DATA_GRID_SOURCE } from './data-grid-source';
import { RecordGridService } from './record-grid.service';
import { DataGridsComponent } from './data-grids.component';

@NgModule({
  declarations: [DataGridsComponent],
  imports: [BrowserModule, FormsModule, AgGridAngular, CommonModule, RedboxPortalCoreModule],
  providers: [
    { provide: DATA_GRID_SOURCE, useExisting: RecordGridService },
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation],
    },
  ],
  bootstrap: [DataGridsComponent],
})
export class DataGridsModule {}
