import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, ChangeDetectionStrategy } from '@angular/core';

import { DashboardFieldCatalogue, DashboardRowConfig } from '../dashboard-config-api.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'column-detail',
  template: `
    @if (column) {
      <div class="dc-column-detail">
        @if (headingLevel === 4) {
          <h4 #heading tabindex="-1" class="dc-column-detail-title">
            <i class="fa fa-pencil" aria-hidden="true"></i>
            {{
              'admin-dashboard-column-edit' | i18next: { name: (column.title || 'admin-dashboard-untitled' | i18next) }
            }}
          </h4>
        }
        @if (headingLevel === 5) {
          <h5 #heading tabindex="-1" class="dc-column-detail-title">
            <i class="fa fa-pencil" aria-hidden="true"></i>
            {{
              'admin-dashboard-column-edit' | i18next: { name: (column.title || 'admin-dashboard-untitled' | i18next) }
            }}
          </h5>
        }
        <div class="dc-column-detail-grid">
          <div class="form-group">
            <label class="dc-form-label" [for]="id + 'title'">{{ 'admin-dashboard-title' | i18next }}</label>
            <input
              type="text"
              class="form-control"
              [id]="id + 'title'"
              [(ngModel)]="column.title"
              (ngModelChange)="columnChange.emit()"
              [placeholder]="'admin-dashboard-title-placeholder' | i18next"
            />
          </div>
          <div class="form-group">
            <label class="dc-form-label" [attr.for]="id + '-field'">{{
              'admin-dashboard-record-field' | i18next
            }}</label>
            <dashboard-field-picker
              [inputId]="id + '-field'"
              [catalogue]="catalogue"
              [(value)]="column.variable"
              (valueChange)="columnChange.emit()"
              [placeholder]="'admin-dashboard-field-example' | i18next"
            ></dashboard-field-picker>
            <small class="dc-form-help">{{ 'admin-dashboard-field-help' | i18next }}</small>
          </div>
          <div class="form-group dc-column-detail-full">
            <label class="dc-form-label" [for]="id + 'template'">{{ 'admin-dashboard-template' | i18next }}</label>
            <textarea
              class="form-control dc-mono"
              rows="4"
              [id]="id + 'template'"
              [(ngModel)]="column.template"
              (ngModelChange)="columnChange.emit()"
              [placeholder]="'admin-dashboard-template-example' | i18next: { example: templateExample }"
            ></textarea>
          </div>
          <div class="form-group">
            <label class="dc-form-label" [for]="id + 'sort'">{{ 'admin-dashboard-initial-sort' | i18next }}</label>
            <select
              class="form-select"
              [id]="id + 'sort'"
              [ngModel]="column.initialSort || ''"
              (ngModelChange)="setInitialSort($event)"
            >
              <option value="">{{ 'admin-dashboard-none' | i18next }}</option>
              <option value="asc">{{ 'admin-dashboard-ascending' | i18next }}</option>
              <option value="desc">{{ 'admin-dashboard-descending' | i18next }}</option>
            </select>
          </div>
          <div class="form-group dc-column-detail-flag">
            <label class="dc-inline-toggle" [for]="id + '-default-sort'">
              <input
                [id]="id + '-default-sort'"
                type="checkbox"
                [(ngModel)]="column.defaultSort"
                (ngModelChange)="columnChange.emit()"
              />
              <span>{{ 'admin-dashboard-default-sort-column' | i18next }}</span>
            </label>
          </div>
        </div>
      </div>
    }
  `,
  standalone: false,
})
export class ColumnDetailComponent {
  @Input() headingLevel = 4;
  @ViewChild('heading') heading?: ElementRef<HTMLHeadingElement>;

  focusHeading(): void {
    const heading = this.heading?.nativeElement;
    if (!heading) return;
    heading.scrollIntoView({ block: 'start', behavior: 'auto' });
    heading.focus({ preventScroll: true });
  }

  @Input() catalogue: DashboardFieldCatalogue | null = null;
  @Output() columnChange = new EventEmitter<void>();
  @Input() column: DashboardRowConfig | null = null;
  static nextId = 0;
  readonly id = `dc-column-${++ColumnDetailComponent.nextId}`;
  setInitialSort(value: 'asc' | 'desc' | ''): void {
    if (!this.column) return;
    if (value) this.column.initialSort = value;
    else delete this.column.initialSort;
    this.columnChange.emit();
  }

  readonly templateExample = '{{title}}';
}
