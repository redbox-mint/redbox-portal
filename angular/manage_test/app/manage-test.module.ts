import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule, FormsModule} from "@angular/forms";
import { HttpModule } from '@angular/http';
import { ManageTestComponent }  from './manage-test.component';
import { PaginationModule,TooltipModule } from 'ngx-bootstrap';
import { SharedModule } from './shared/shared.module';
import { AgGridModule } from 'ag-grid-angular';
import * as $ from 'jquery';

/**
 * Dashboard Module
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 * @param  {[   BrowserModule}           {imports
 * @param  {[type]} HttpModule
 * @param  {[type]} ReactiveFormsModule
 * @param  {[type]} FormsModule
 * @param  {[type]} PaginationModule.forRoot(
 * @return {[type]}
 */
@NgModule({
  imports:      [ BrowserModule, HttpModule, ReactiveFormsModule, FormsModule, PaginationModule.forRoot(),
    TooltipModule.forRoot(), AgGridModule.withComponents([]), SharedModule ],
  declarations: [ ManageTestComponent,  ],
  providers:    [  ],
  bootstrap:    [ ManageTestComponent ]
})
export class ManageTestModule { }
