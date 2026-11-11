import { Component, EventEmitter, Input, Output } from '@angular/core';
import { I18NextPipe } from './i18next.pipe';

/** A bounded pager that always exposes the first and last pages. */
@Component({
  selector: 'rb-admin-pager',
  standalone: true,
  imports: [I18NextPipe],
  template: `
    @if (totalPages > 1) {
      <nav [attr.aria-label]="'admin-pagination' | i18next"><ul class="pagination">
        <li class="page-item" [class.disabled]="disabled || page <= 1"><button type="button" class="page-link" [disabled]="disabled || page <= 1" [attr.aria-label]="'admin-vocabulary-pagination-previous' | i18next" (click)="go(page - 1)">‹</button></li>
        @for (item of items; track $index) {
          @if (item === null) {
            <li class="page-item disabled"><span class="page-link" aria-hidden="true">…</span></li>
          } @else {
            <li class="page-item" [class.active]="page === item"><button type="button" class="page-link" [disabled]="disabled" [attr.aria-current]="page === item ? 'page' : null" [attr.aria-label]="'admin-pagination-page' | i18next: { page: item }" (click)="go(item)">{{ item }}</button></li>
          }
        }
        <li class="page-item" [class.disabled]="disabled || page >= totalPages"><button type="button" class="page-link" [disabled]="disabled || page >= totalPages" [attr.aria-label]="'admin-vocabulary-pagination-next' | i18next" (click)="go(page + 1)">›</button></li>
      </ul></nav>
    }
  `
})
export class AdminPagerComponent {
  @Input() page = 1;
  @Input() totalPages = 1;
  @Input() disabled = false;
  @Output() pageChange = new EventEmitter<number>();

  get items(): Array<number | null> {
    const total = this.totalPages;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const current = Math.max(2, Math.min(this.page, total - 1));
    const pages = [...new Set([1, current - 1, current, current + 1, total])].sort((a, b) => a - b);
    const result: Array<number | null> = [];
    for (const page of pages) {
      const previous = result[result.length - 1];
      if (typeof previous === 'number' && page - previous > 1) result.push(page - previous === 2 ? previous + 1 : null);
      result.push(page);
    }
    return result;
  }

  go(page: number): void {
    if (!this.disabled && page >= 1 && page <= this.totalPages && page !== this.page) this.pageChange.emit(page);
  }
}
