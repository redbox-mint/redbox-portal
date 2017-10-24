import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule, FormsModule} from "@angular/forms";
import { HttpModule } from '@angular/http';
import { AppComponent }  from './app.component';
import { StringTemplatePipe }  from '../shared/StringTemplatePipe';
import { MultivalueFieldPipe }  from './MultivalueFieldPipe';
import { PaginationModule,TooltipModule } from 'ngx-bootstrap';
import { SharedModule } from '../shared/shared.module';
import { ReportService } from '../shared/report-service';

@NgModule({
  imports:      [ BrowserModule, HttpModule, ReactiveFormsModule, FormsModule, PaginationModule.forRoot(), TooltipModule.forRoot(), SharedModule ],
  declarations: [ AppComponent, StringTemplatePipe, MultivalueFieldPipe ],
  providers:    [  ReportService ],
  bootstrap:    [ AppComponent ]
})
export class AppModule { }
