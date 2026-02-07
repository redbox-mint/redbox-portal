import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';

import { AdminVocabularyComponent } from './admin-vocabulary.component';
import { VocabularyApiService } from './vocabulary-api.service';
import { VocabListComponent } from './vocab-list.component';
import { VocabDetailComponent } from './vocab-detail.component';
import { RvaImportComponent } from './rva-import.component';

@NgModule({
  declarations: [
    AdminVocabularyComponent,
    VocabListComponent,
    VocabDetailComponent,
    RvaImportComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    RedboxPortalCoreModule
  ],
  providers: [
    VocabularyApiService,
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    }
  ],
  bootstrap: [AdminVocabularyComponent]
})
export class AdminVocabularyModule {}
