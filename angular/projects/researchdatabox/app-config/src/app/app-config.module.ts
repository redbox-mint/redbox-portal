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

@NgModule({
  declarations: [
    AppConfigComponent, ArrayTypeComponent, ObjectTypeComponent, TextAreaComponent, MenuEditorTypeComponent, AdminSidebarEditorTypeComponent, HomePanelsEditorTypeComponent
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
      { name: 'menu-editor', component: MenuEditorTypeComponent },
      { name: 'admin-sidebar-editor', component: AdminSidebarEditorTypeComponent },
      { name: 'home-panels-editor', component: HomePanelsEditorTypeComponent }
    ],
  }),
    FormlyBootstrapModule
  ],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    }
  ],
  bootstrap: [AppConfigComponent]
})
export class AppConfigModule { }
