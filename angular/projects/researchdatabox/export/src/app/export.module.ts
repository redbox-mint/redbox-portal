import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from "@angular/forms";
// import { NKDatetimeModule } from 'ng2-datetime/ng2-datetime';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { isEmpty as _isEmpty } from 'lodash-es';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { RedboxPortalCoreModule } from '@researchdatabox/redbox-portal-core';
import { ExportComponent } from './export.component';

function trimLastSlashFromUrl(baseUrl: string) {
  if (!_isEmpty(baseUrl) && (baseUrl[baseUrl.length - 1] == '/')) {
    var trimmedUrl = baseUrl.substring(0, baseUrl.length - 1);
    return trimmedUrl;
  }
  return baseUrl;
}

@NgModule({
  declarations: [
    ExportComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    BrowserAnimationsModule,
    RedboxPortalCoreModule,
    BsDatepickerModule.forRoot()
  ],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    }
  ],
  bootstrap: [ExportComponent]
})
export class ExportModule { }