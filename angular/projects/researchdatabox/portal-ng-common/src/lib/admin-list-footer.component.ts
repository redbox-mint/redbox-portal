import { Component, Input } from '@angular/core';
import { I18NextPipe } from './i18next.pipe';

/** Count and optional pager shared by admin lists. Empty lists own their empty state. */
@Component({
  selector: 'rb-admin-list-footer',
  standalone: true,
  imports: [I18NextPipe],
  template: `
    @if (total > 0) {
      <div class="card-footer">
        <span>{{ 'admin-vocabulary-pagination-range' | i18next: { start: start, end: end, total: total } }}</span>
        @if (pageCount > 1) { <ng-content></ng-content> }
      </div>
    }
  `
})
export class AdminListFooterComponent {
  @Input() total = 0;
  @Input() start = 1;
  @Input() end = 0;
  @Input() pageCount = 1;
}
