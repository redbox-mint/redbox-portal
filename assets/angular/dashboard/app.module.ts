import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule, FormsModule} from "@angular/forms";
import { HttpModule } from '@angular/http';
import { AppComponent }  from './app.component';
import { PaginationModule,TooltipModule } from 'ngx-bootstrap';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  imports:      [ BrowserModule, HttpModule, ReactiveFormsModule, FormsModule, PaginationModule.forRoot(), TooltipModule.forRoot(), SharedModule ],
  declarations: [ AppComponent ],
  providers:    [  ],
  bootstrap:    [ AppComponent ]
})
export class AppModule { }
