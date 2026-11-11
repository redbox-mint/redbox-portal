import { A11yModule } from '@angular/cdk/a11y';
import { NgModule } from '@angular/core';
import { AdminSaveShortcutComponent } from './admin-save-shortcut.component';
import { AdminPagerComponent } from './admin-pager.component';
import { AdminListFooterComponent } from './admin-list-footer.component';
import { AdminDiscardDialogComponent } from './admin-discard-dialog.component';
import { AdminOverflowDirective } from './admin-overflow.directive';
import { AdminModalDirective } from './admin-modal.directive';
import { AdminAutoFilterDirective } from './admin-auto-filter.directive';
import { AdminTabsDirective } from './admin-tabs.directive';
import { AdminCountPipe } from './admin-count.pipe';
import { AdminDatePipe } from './admin-date.pipe';

const adminComponents = [A11yModule, AdminSaveShortcutComponent, AdminPagerComponent, AdminListFooterComponent, AdminDiscardDialogComponent, AdminOverflowDirective, AdminModalDirective, AdminAutoFilterDirective, AdminTabsDirective, AdminCountPipe, AdminDatePipe];

@NgModule({ imports: adminComponents, exports: adminComponents })
export class RedboxPortalAdminModule {}
