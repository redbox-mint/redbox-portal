import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DashboardFieldCatalogue, DashboardRowConfig } from '../dashboard-config-api.service';

@Component({
  selector: 'column-detail',
  template: `
    <div class="dc-column-detail" *ngIf="column">
      <h6 class="dc-column-detail-title">
        <i class="fa fa-pencil"></i>
        {{ 'admin-dashboard-column-edit' | i18next: { name: ((column.title || 'admin-dashboard-untitled') | i18next) } }}
      </h6>
      <div class="dc-column-detail-grid">
        <div class="form-group">
          <label class="dc-form-label" [for]="id + 'title'">{{ 'admin-dashboard-title' | i18next }}</label>
          <input type="text" class="form-control" [id]="id + 'title'" [(ngModel)]="column.title" (ngModelChange)="columnChange.emit()" [placeholder]="'admin-dashboard-title-placeholder' | i18next" />
        </div>
        <div class="form-group">
          <label class="dc-form-label" [attr.for]="id + '-field'">{{ 'admin-dashboard-record-field' | i18next }}</label>
          <dashboard-field-picker [inputId]="id + '-field'" [catalogue]="catalogue" [(value)]="column.variable" (valueChange)="columnChange.emit()" placeholder="e.g. metadata.title"></dashboard-field-picker>
          <small class="dc-form-help">{{ 'admin-dashboard-field-help' | i18next }}</small>
        </div>
        <div class="form-group dc-column-detail-full">
          <label class="dc-form-label" [for]="id + 'template'">{{ 'admin-dashboard-template' | i18next }}</label>
          <textarea class="form-control dc-mono" rows="4" [id]="id + 'template'" [(ngModel)]="column.template" (ngModelChange)="columnChange.emit()" [placeholder]="templatePlaceholder"></textarea>
        </div>
        <div class="form-group">
          <label class="dc-form-label" [for]="id + 'sort'">{{ 'admin-dashboard-initial-sort' | i18next }}</label>
          <select class="form-control" [id]="id + 'sort'" [ngModel]="column.initialSort || ''" (ngModelChange)="setInitialSort($event)">
            <option value="">{{ 'admin-dashboard-none' | i18next }}</option>
            <option value="asc">{{ 'admin-dashboard-ascending' | i18next }}</option>
            <option value="desc">{{ 'admin-dashboard-descending' | i18next }}</option>
          </select>
        </div>
        <div class="form-group dc-column-detail-flag">
          <label class="dc-inline-toggle">
            <input type="checkbox" [(ngModel)]="column.defaultSort" (ngModelChange)="columnChange.emit()" />
            <span>{{ 'admin-dashboard-default-sort-column' | i18next }}</span>
          </label>
        </div>
      </div>
    </div>
  `,
  standalone: false
})
export class ColumnDetailComponent {
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

  readonly templatePlaceholder = 'Handlebars template, e.g. {{title}}';
}
