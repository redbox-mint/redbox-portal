import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { DashboardComponent } from './dashboard.component';
import { SortComponent } from './sort/sort.component';

@NgModule({
  declarations: [
    DashboardComponent,
    SortComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
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
