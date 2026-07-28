import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { RouterModule } from '@angular/router'; 
import { FormlyModule } from '@ngx-formly/core';
import { FormlyBootstrapModule } from '@ngx-formly/bootstrap';
import { AppConfigComponent } from './app-config.component';
import { ArrayTypeComponent } from './fieldTypes/array.type';
import { ObjectTypeComponent } from './fieldTypes/object.type';
import { TextAreaComponent } from './fieldTypes/textarea.type';
import { FormlyFieldTextArea } from '@ngx-formly/bootstrap/textarea';
import { MenuEditorTypeComponent } from './fieldTypes/menu-editor';
import { AdminSidebarEditorTypeComponent } from './fieldTypes/admin-sidebar-editor';
import { HomePanelsEditorTypeComponent } from './fieldTypes/home-panels-editor';
import { ValueBindingEditorTypeComponent } from './fieldTypes/value-binding-editor';
import { FigshareCategoryMappingEditorTypeComponent } from './fieldTypes/figshare-category-mapping-editor';
import { FigshareCrosswalkSelectTypeComponent } from './fieldTypes/figshare-category-crosswalk-select';
import { FigshareSourceVocabularySelectTypeComponent } from './fieldTypes/figshare-source-vocabulary-select';
import { CheckboxTypeComponent } from './fieldTypes/checkbox.type';
import { FigshareCrosswalkApiService } from './services/figshare-crosswalk-api.service';

@NgModule({
  declarations: [
    AppConfigComponent, ArrayTypeComponent, ObjectTypeComponent, TextAreaComponent, CheckboxTypeComponent, MenuEditorTypeComponent, AdminSidebarEditorTypeComponent, HomePanelsEditorTypeComponent, ValueBindingEditorTypeComponent, FigshareCategoryMappingEditorTypeComponent, FigshareCrosswalkSelectTypeComponent, FigshareSourceVocabularySelectTypeComponent
  ],
  imports: [
    BrowserModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    RedboxPortalCoreModule,
   FormlyModule.forRoot({
    types: [
      { name: 'array', component: ArrayTypeComponent },
      { name: 'object', component: ObjectTypeComponent },
      { name: 'textarea', component: FormlyFieldTextArea },
      { name: 'app-config-checkbox', component: CheckboxTypeComponent },
      { name: 'menu-editor', component: MenuEditorTypeComponent },
      { name: 'admin-sidebar-editor', component: AdminSidebarEditorTypeComponent },
      { name: 'home-panels-editor', component: HomePanelsEditorTypeComponent },
      { name: 'value-binding-editor', component: ValueBindingEditorTypeComponent },
      { name: 'figshare-category-mapping-editor', component: FigshareCategoryMappingEditorTypeComponent },
      { name: 'figshare-category-crosswalk-select', component: FigshareCrosswalkSelectTypeComponent },
      { name: 'figshare-source-vocabulary-select', component: FigshareSourceVocabularySelectTypeComponent }
    ],
  }),
    FormlyBootstrapModule
  ],
  providers: [
    FigshareCrosswalkApiService,
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    }
  ],
  bootstrap: [AppConfigComponent]
})
export class AppConfigModule { }
