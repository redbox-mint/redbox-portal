import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF, PlatformLocation, CommonModule } from '@angular/common';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { ManageRolesComponent } from './manage-roles.component';
import { AuthorizationAdminService } from './authorization-admin.service';
import { AssignmentListComponent } from './assignments/assignment-list.component';
import { AuthorizationAuditComponent } from './audit/authorization-audit.component';
import { ImpactPreviewComponent } from './roles/impact-preview.component';
import { RoleEditorComponent } from './roles/role-editor.component';
import { RoleListComponent } from './roles/role-list.component';
import { ScopeSelectorComponent } from './roles/scope-selector.component';
import { ScopeCatalogComponent } from './scopes/scope-catalog.component';

@NgModule({
  declarations: [
    ManageRolesComponent,
    AssignmentListComponent,
    AuthorizationAuditComponent,
    ImpactPreviewComponent,
    RoleEditorComponent,
    RoleListComponent,
    ScopeCatalogComponent,
    ScopeSelectorComponent,
  ],
  imports: [BrowserModule, FormsModule, BrowserAnimationsModule, RedboxPortalCoreModule, CommonModule],
  providers: [
    AuthorizationAdminService,
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation],
    },
  ],
  bootstrap: [ManageRolesComponent],
})
export class ManageRolesModule {}
