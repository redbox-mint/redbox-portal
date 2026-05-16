import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DashboardRowConfig } from '../dashboard-config-api.service';

@Component({
  selector: 'column-editor',
  template: `
    <div class="dc-column-editor">
      <header class="dc-column-editor-header">
        <div>
          <h5 class="dc-column-editor-title">
            <i class="fa fa-columns"></i>
            Columns
          </h5>
          <small class="dc-column-editor-subtitle">Click a row to edit its template and sorting.</small>
        </div>
        <button type="button" class="btn btn-primary btn-sm" (click)="addColumn()">
          <i class="fa fa-plus"></i>
          Add Column
        </button>
      </header>

      <div class="dc-column-list" *ngIf="columns.length; else emptyTpl">
        <button
          type="button"
          *ngFor="let col of columns; let i = index"
          class="dc-column-item"
          [class.active]="selectedColumn === col"
          (click)="selectColumn(col)"
        >
          <span class="dc-column-index">{{ i + 1 }}</span>
          <span class="dc-column-info">
            <span class="dc-column-title">{{ col.title || 'Untitled' }}</span>
            <span class="dc-column-variable">{{ col.variable || '—' }}</span>
          </span>
          <span class="dc-column-flags">
            <span class="dc-column-flag" *ngIf="col.defaultSort" title="Default sort">
              <i class="fa fa-star"></i>
            </span>
            <span class="dc-column-flag" *ngIf="col.initialSort" [title]="'Initial sort: ' + col.initialSort">
              <i class="fa" [class.fa-sort-amount-asc]="col.initialSort === 'asc'" [class.fa-sort-amount-desc]="col.initialSort === 'desc'"></i>
            </span>
          </span>
          <span class="dc-column-actions">
            <span
              class="btn btn-xs dc-btn-remove"
              role="button"
              tabindex="0"
              (click)="removeColumn(i, $event)"
              (keydown.enter)="removeColumn(i, $event)"
              (keydown.space)="removeColumn(i, $event)"
            >
              <i class="fa fa-trash"></i>
              Remove
            </span>
          </span>
        </button>
      </div>

      <ng-template #emptyTpl>
        <div class="dc-column-empty">
          <i class="fa fa-columns"></i>
          <p>No columns defined yet. Add one to get started.</p>
        </div>
      </ng-template>

      <div class="dc-column-detail-wrap" *ngIf="selectedColumn">
        <column-detail [column]="selectedColumn"></column-detail>
      </div>
    </div>
  `,
  styles: [`
    .dc-column-editor {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .dc-column-editor-header {
      align-items: flex-start;
      display: flex;
      gap: 12px;
      justify-content: space-between;
    }
    .dc-column-editor-header .btn i {
      margin-right: 6px;
    }
    .dc-column-editor-title {
      align-items: center;
      color: var(--dc-text, #1f2937);
      display: inline-flex;
      font-size: 0.95rem;
      font-weight: 600;
      gap: 8px;
      margin: 0 0 2px;
    }
    .dc-column-editor-title i {
      color: var(--dc-text-subtle, #6b7280);
    }
    .dc-column-editor-subtitle {
      color: var(--dc-text-subtle, #6b7280);
      font-size: 12px;
    }
    .dc-column-list {
      border: 1px solid var(--dc-border, #e5e7eb);
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .dc-column-item {
      align-items: center;
      background: #fff;
      border: 0;
      border-bottom: 1px solid var(--dc-border, #e5e7eb);
      cursor: pointer;
      display: grid;
      gap: 12px;
      grid-template-columns: 28px minmax(0, 1fr) auto auto;
      padding: 10px 14px;
      text-align: left;
      transition: background 120ms ease;
      width: 100%;
    }
    .dc-column-item:last-child {
      border-bottom: 0;
    }
    .dc-column-item:hover {
      background: var(--dc-surface-muted, #f9fafb);
    }
    .dc-column-item.active {
      background: var(--dc-accent-soft, #eff6ff);
      box-shadow: inset 3px 0 0 var(--dc-accent, #2563eb);
    }
    .dc-column-index {
      background: var(--dc-surface-deeper, #f3f4f6);
      border-radius: 4px;
      color: var(--dc-text-muted, #4b5563);
      font-size: 11px;
      font-weight: 600;
      padding: 3px 0;
      text-align: center;
      width: 28px;
    }
    .dc-column-item.active .dc-column-index {
      background: var(--dc-accent, #2563eb);
      color: #fff;
    }
    .dc-column-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .dc-column-title {
      color: var(--dc-text, #1f2937);
      font-size: 13px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dc-column-variable {
      color: var(--dc-text-subtle, #6b7280);
      font-family: "SFMono-Regular", "Consolas", "Liberation Mono", "Menlo", monospace;
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dc-column-flags {
      align-items: center;
      color: var(--dc-text-subtle, #6b7280);
      display: inline-flex;
      gap: 8px;
    }
    .dc-column-flag i {
      font-size: 12px;
    }
    .dc-column-actions {
      align-items: center;
      display: inline-flex;
    }
    .dc-btn-remove {
      background: var(--dc-danger-soft, #fef2f2) !important;
      border: 1px solid transparent !important;
      color: var(--dc-danger, #b91c1c) !important;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      padding: 4px 10px !important;
      transition: background 120ms ease, border-color 120ms ease;
      white-space: nowrap;
    }
    .dc-btn-remove:hover {
      background: #fee2e2 !important;
      border-color: rgba(185, 28, 28, 0.2) !important;
    }
    .dc-btn-remove i {
      margin-right: 4px;
    }
    .dc-column-empty {
      align-items: center;
      background: var(--dc-surface-muted, #f9fafb);
      border: 1px dashed var(--dc-border, #e5e7eb);
      border-radius: 6px;
      color: var(--dc-text-subtle, #6b7280);
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 28px 16px;
      text-align: center;
    }
    .dc-column-empty i {
      font-size: 20px;
    }
    .dc-column-empty p {
      margin: 0;
    }
    .dc-column-detail-wrap {
      background: var(--dc-surface-muted, #f9fafb);
      border: 1px solid var(--dc-border, #e5e7eb);
      border-radius: 6px;
      padding: 14px 16px;
    }
  `],
  standalone: false
})
export class ColumnEditorComponent {
  @Input() columns: DashboardRowConfig[] = [];
  @Output() columnsChange = new EventEmitter<DashboardRowConfig[]>();
  selectedColumn: DashboardRowConfig | null = null;

  selectColumn(col: DashboardRowConfig): void {
    this.selectedColumn = col;
  }

  addColumn(): void {
    const newCol: DashboardRowConfig = { title: 'New Column', variable: '', template: '' };
    this.columns = [...this.columns, newCol];
    this.columnsChange.emit(this.columns);
    this.selectedColumn = newCol;
  }

  removeColumn(index: number, event: Event): void {
    event.stopPropagation();
    this.columns = this.columns.filter((_, i) => i !== index);
    this.columnsChange.emit(this.columns);
    if (this.selectedColumn && !this.columns.includes(this.selectedColumn)) {
      this.selectedColumn = null;
    }
  }
}
