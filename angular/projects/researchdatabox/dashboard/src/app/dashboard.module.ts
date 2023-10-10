import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { RouterModule } from '@angular/router'; 
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { PaginationModule } from 'ngx-bootstrap/pagination';

import { DashboardComponent } from './dashboard.component';
import { SortComponent } from './sort/sort.component';

@NgModule({
  declarations: [
    DashboardComponent,
    SortComponent
  ],
  imports: [
    BrowserModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    RedboxPortalCoreModule,
    PaginationModule.forRoot(), 
    TooltipModule.forRoot()
  ],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    }
  ],
  bootstrap: [DashboardComponent]
})
export class DashboardModule { }
