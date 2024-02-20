import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule, FormsModule} from "@angular/forms";
import { HttpModule } from '@angular/http';
import { WorkspaceListComponent }  from './workspace.component';
import { PaginationModule,TooltipModule } from 'ngx-bootstrap';
import { SharedModule } from './shared/shared.module';
import * as $ from 'jquery';

/**
 * Workspace List Module
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
  imports:      [ BrowserModule, HttpModule, ReactiveFormsModule, FormsModule, PaginationModule.forRoot(), TooltipModule.forRoot(), SharedModule ],
  declarations: [ WorkspaceListComponent ],
  providers:    [],
  bootstrap:    [ WorkspaceListComponent ],
  entryComponents: [ ]
})
export class WorkspaceListModule { }
