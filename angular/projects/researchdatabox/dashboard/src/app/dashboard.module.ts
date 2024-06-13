import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
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
    FormsModule,
    BrowserAnimationsModule,
    RedboxPortalCoreModule,
    BsDatepickerModule.forRoot(),
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
