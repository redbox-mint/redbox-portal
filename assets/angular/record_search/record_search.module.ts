import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule, FormsModule } from "@angular/forms";
import { HttpModule } from '@angular/http';
import { RecordSearchComponent, RecordSearchRefinerComponent }  from './record-search.component';
import { SharedModule } from '../shared/shared.module';


@NgModule({
  imports:      [ BrowserModule, HttpModule, ReactiveFormsModule, FormsModule, SharedModule],
  declarations: [ RecordSearchComponent, RecordSearchRefinerComponent ],
  providers:    [ ],
  bootstrap:    [ RecordSearchComponent, RecordSearchRefinerComponent ]
})
export class RecordSearchModule { }
