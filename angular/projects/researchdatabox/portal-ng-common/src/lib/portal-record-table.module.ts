import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { HeaderSortComponent } from './header-sort.component';
import { I18NextPipe } from './i18next.pipe';
import { RecordTableComponent } from './record-table.component';

/** Optional record table, sorting and pagination UI. */
@NgModule({
  declarations: [RecordTableComponent, HeaderSortComponent],
  imports: [CommonModule, FormsModule, I18NextPipe, PaginationModule],
  exports: [RecordTableComponent, HeaderSortComponent, PaginationModule]
})
export class RedboxPortalRecordTableModule {}
