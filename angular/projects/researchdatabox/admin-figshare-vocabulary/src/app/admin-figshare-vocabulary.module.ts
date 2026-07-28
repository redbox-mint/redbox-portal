import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF, PlatformLocation, CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';

import { AdminFigshareVocabularyComponent } from './admin-figshare-vocabulary.component';
import { FigshareVocabularyApiService } from './services/figshare-vocabulary-api.service';
import { FigshareSourceListComponent } from './sources/figshare-source-list.component';
import { FigshareImportWizardComponent } from './import/figshare-import-wizard.component';
import { FigshareSyncPreviewComponent } from './sync-preview/figshare-sync-preview.component';
import { FigshareCrosswalkListComponent } from './crosswalks/figshare-crosswalk-list.component';
import { FigshareCrosswalkEditorComponent } from './crosswalks/figshare-crosswalk-editor.component';

@NgModule({
  declarations: [
    AdminFigshareVocabularyComponent,
    FigshareSourceListComponent,
    FigshareImportWizardComponent,
    FigshareSyncPreviewComponent,
    FigshareCrosswalkListComponent,
    FigshareCrosswalkEditorComponent
  ],
  imports: [
    BrowserModule,
    A11yModule,
    FormsModule,
    RedboxPortalCoreModule,
    CommonModule
  ],
  providers: [
    FigshareVocabularyApiService,
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    }
  ],
  bootstrap: [AdminFigshareVocabularyComponent]
})
export class AdminFigshareVocabularyModule {}
