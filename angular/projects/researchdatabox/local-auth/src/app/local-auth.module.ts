import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { RedboxPortalCoreModule } from '@researchdatabox/redbox-portal-core';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { RouterModule } from '@angular/router'; 
import * as _ from 'lodash';

import { LocalAuthComponent } from './local-auth.component';

function trimLastSlashFromUrl(baseUrl: string) {
  if (!_.isEmpty(baseUrl) && (baseUrl[baseUrl.length - 1] == '/')) {
    var trimmedUrl = baseUrl.substring(0, baseUrl.length - 1);
    return trimmedUrl;
  }
  return baseUrl;
}

@NgModule({
  declarations: [
    LocalAuthComponent
  ],
  imports: [
    BrowserModule,
    ReactiveFormsModule,
    RouterModule,
    RedboxPortalCoreModule
  ],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    }
  ],
  bootstrap: [LocalAuthComponent]
})
export class LocalAuthModule { }
