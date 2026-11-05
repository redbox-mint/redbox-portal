import { NavigationRowComponent } from './fieldTypes/navigation-editor/navigation-row.component';
import { NavigationFieldsComponent } from './fieldTypes/navigation-editor/navigation-fields.component';
import { NavigationLinkDialogComponent } from './fieldTypes/navigation-editor/navigation-link-dialog.component';
import { ChipsTypeComponent } from './fieldTypes/chips.type';
import { SecretTypeComponent } from './fieldTypes/secret.type';
import { SectionTypeComponent } from './fieldTypes/section.type';
import { A11yModule } from '@angular/cdk/a11y';
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
import { CheckboxTypeComponent } from './fieldTypes/checkbox.type';
import { FigshareCrosswalkApiService } from './services/figshare-crosswalk-api.service';

@NgModule({
  declarations: [
    AppConfigComponent, NavigationRowComponent, NavigationFieldsComponent, NavigationLinkDialogComponent, SectionTypeComponent, SecretTypeComponent, ChipsTypeComponent, ArrayTypeComponent, ObjectTypeComponent, TextAreaComponent, CheckboxTypeComponent, MenuEditorTypeComponent, AdminSidebarEditorTypeComponent, HomePanelsEditorTypeComponent, ValueBindingEditorTypeComponent, FigshareCategoryMappingEditorTypeComponent
  ],
  imports: [
    BrowserModule,
    A11yModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    RedboxPortalCoreModule,
   FormlyModule.forRoot({
    types: [
      { name: 'app-config-section', component: SectionTypeComponent },
      { name: 'app-config-secret', component: SecretTypeComponent },
      { name: 'app-config-chips', component: ChipsTypeComponent },
      { name: 'array', component: ArrayTypeComponent },
      { name: 'object', component: ObjectTypeComponent },
      { name: 'textarea', component: FormlyFieldTextArea },
      { name: 'app-config-checkbox', component: CheckboxTypeComponent },
      { name: 'menu-editor', component: MenuEditorTypeComponent },
      { name: 'admin-sidebar-editor', component: AdminSidebarEditorTypeComponent },
      { name: 'home-panels-editor', component: HomePanelsEditorTypeComponent },
      { name: 'value-binding-editor', component: ValueBindingEditorTypeComponent },
      { name: 'figshare-category-mapping-editor', component: FigshareCategoryMappingEditorTypeComponent }
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
