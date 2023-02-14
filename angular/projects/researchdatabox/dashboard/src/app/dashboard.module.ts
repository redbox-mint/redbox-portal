import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { RedboxPortalCoreModule } from '@researchdatabox/redbox-portal-core';
import { RouterModule } from '@angular/router'; 
import * as _ from 'lodash';

import { DashboardComponent } from './dashboard.component';

@NgModule({
  declarations: [
    DashboardComponent
  ],
  imports: [
    BrowserModule,
    ReactiveFormsModule,
    RouterModule,
    RedboxPortalCoreModule
  ],
  providers: [],
  bootstrap: [DashboardComponent]
})
export class DashboardModule { }
