import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { APP_BASE_HREF, PlatformLocation, CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import {
  RedboxPortalCoreServicesModule,
  trimLastSlashFromUrl,
  PublicationVocabularyApiService,
} from '@researchdatabox/portal-ng-common';

import { PublicationVocabularyAdminComponent } from './shared/publication-vocabulary-admin.component';
import { AdminFigshareVocabularyComponent } from './admin-figshare-vocabulary.component';
import { FigshareVocabularyApiService } from './services/figshare-vocabulary-api.service';
import { FigshareSourceListComponent } from './sources/figshare-source-list.component';
import { FigshareImportWizardComponent } from './import/figshare-import-wizard.component';
import { FigshareSyncPreviewComponent } from './sync-preview/figshare-sync-preview.component';
import { FigshareCrosswalkListComponent } from './crosswalks/figshare-crosswalk-list.component';
import { FigshareCrosswalkEditorComponent } from './crosswalks/figshare-crosswalk-editor.component';
import { FigshareMappingPickerComponent } from './crosswalks/figshare-mapping-picker.component';

@NgModule({
  declarations: [
    AdminFigshareVocabularyComponent,
    PublicationVocabularyAdminComponent,
    FigshareSourceListComponent,
    FigshareImportWizardComponent,
    FigshareSyncPreviewComponent,
    FigshareCrosswalkListComponent,
    FigshareCrosswalkEditorComponent,
    FigshareMappingPickerComponent,
  ],
  imports: [BrowserModule, A11yModule, FormsModule, ReactiveFormsModule, RedboxPortalCoreServicesModule, CommonModule],
  providers: [
    FigshareVocabularyApiService,
    PublicationVocabularyApiService,
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation],
    },
  ],
  bootstrap: [AdminFigshareVocabularyComponent],
})
export class AdminFigshareVocabularyModule {}
