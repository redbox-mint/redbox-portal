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
import { NKDatetimeModule } from 'ng2-datetime/ng2-datetime';

@NgModule({
  imports:      [ BrowserModule, HttpModule, ReactiveFormsModule, FormsModule, PaginationModule.forRoot(), TooltipModule.forRoot(), SharedModule, NKDatetimeModule],
  declarations: [ AppComponent, StringTemplatePipe, MultivalueFieldPipe ],
  providers:    [  ReportService ],
  bootstrap:    [ AppComponent ]
})
export class AppModule { }
