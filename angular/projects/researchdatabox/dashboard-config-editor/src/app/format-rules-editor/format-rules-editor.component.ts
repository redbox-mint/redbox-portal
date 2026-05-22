import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { DashboardFormatRules } from '../dashboard-config-api.service';

@Component({
  selector: 'format-rules-editor',
  template: `
    <div class="dc-format-rules-editor">
      <header class="dc-format-rules-header">
        <h5 class="dc-format-rules-title">
          <i class="fa fa-sliders"></i>
          Format Rules
        </h5>
        <small class="dc-format-rules-subtitle">Control sorting, grouping, and filtering for the rendered table.</small>
      </header>

      <div class="dc-format-rules-grid">
        <div class="form-group">
          <label class="dc-form-label">Sort By</label>
          <input type="text" class="form-control" [(ngModel)]="formatRules.sortBy" placeholder="e.g. metaMetadata.lastSaveDate" (ngModelChange)="emit()" />
          <small class="dc-form-help">Field used to sort the records.</small>
        </div>
        <div class="form-group">
          <label class="dc-form-label">Group By</label>
          <input type="text" class="form-control" [(ngModel)]="formatRules.groupBy" placeholder="Optional grouping field" (ngModelChange)="emit()" />
          <small class="dc-form-help">Field used to group rows together.</small>
        </div>
        <div class="form-group dc-format-rules-full">
          <label class="dc-form-label">
            Filter By
            <span class="dc-json-hint" [class.invalid]="!filterByValid">JSON</span>
          </label>
          <textarea class="form-control dc-mono" rows="3" [(ngModel)]="filterByJson" (ngModelChange)="onFilterByChange($event)" placeholder='{ "field": "value" }'></textarea>
          <small class="dc-form-help" [class.dc-form-help-error]="!filterByValid">
            <ng-container *ngIf="filterByValid">Mongo-style filter applied to the dashboard query.</ng-container>
            <ng-container *ngIf="!filterByValid">Invalid JSON — last change ignored.</ng-container>
          </small>
        </div>
        <div class="form-group dc-format-rules-full">
          <label class="dc-form-label">
            Sort Group By
            <span class="dc-json-hint" [class.invalid]="!sortGroupByValid">JSON</span>
          </label>
          <textarea class="form-control dc-mono" rows="3" [(ngModel)]="sortGroupByJson" (ngModelChange)="onSortGroupByChange($event)" placeholder='[{ "field": "asc" }]'></textarea>
          <small class="dc-form-help" [class.dc-form-help-error]="!sortGroupByValid">
            <ng-container *ngIf="sortGroupByValid">Multi-field ordering for grouped rows.</ng-container>
            <ng-container *ngIf="!sortGroupByValid">Invalid JSON — last change ignored.</ng-container>
          </small>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dc-format-rules-editor {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .dc-format-rules-header {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .dc-format-rules-title {
      align-items: center;
      color: var(--dc-text, #1f2937);
      display: inline-flex;
      font-size: 0.95rem;
      font-weight: 600;
      gap: 8px;
      margin: 0;
    }
    .dc-format-rules-title i {
      color: var(--dc-text-subtle, #6b7280);
    }
    .dc-format-rules-subtitle {
      color: var(--dc-text-subtle, #6b7280);
      font-size: 12px;
    }
    .dc-format-rules-grid {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .dc-format-rules-full {
      grid-column: 1 / -1;
    }
    .dc-form-label {
      align-items: center;
      color: var(--dc-text-muted, #4b5563);
      display: inline-flex;
      font-size: 0.85rem;
      font-weight: 600;
      gap: 8px;
      margin-bottom: 4px;
    }
    .dc-form-help {
      color: var(--dc-text-subtle, #6b7280);
      font-size: 12px;
    }
    .dc-form-help-error {
      color: var(--dc-danger, #b91c1c);
    }
    .dc-json-hint {
      background: var(--dc-surface-deeper, #f3f4f6);
      border-radius: 3px;
      color: var(--dc-text-subtle, #6b7280);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.05em;
      padding: 2px 6px;
      text-transform: uppercase;
    }
    .dc-json-hint.invalid {
      background: var(--dc-danger-soft, #fef2f2);
      color: var(--dc-danger, #b91c1c);
    }
    .dc-mono {
      font-family: "SFMono-Regular", "Consolas", "Liberation Mono", "Menlo", monospace;
      font-size: 12px;
    }
    @media (max-width: 767px) {
      .dc-format-rules-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
  standalone: false
})
export class FormatRulesEditorComponent implements OnChanges {
  @Input() formatRules: DashboardFormatRules = {};
  @Output() formatRulesChange = new EventEmitter<DashboardFormatRules>();

  filterByJson = '';
  sortGroupByJson = '';
  filterByValid = true;
  sortGroupByValid = true;

  ngOnInit(): void {
    this.syncJson();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['formatRules']) {
      this.syncJson();
    }
  }

  private syncJson(): void {
    this.filterByJson = this.formatRules.filterBy ? JSON.stringify(this.formatRules.filterBy, null, 2) : '';
    this.sortGroupByJson = this.formatRules.sortGroupBy ? JSON.stringify(this.formatRules.sortGroupBy, null, 2) : '';
    this.filterByValid = true;
    this.sortGroupByValid = true;
  }

  emit(): void {
    this.formatRulesChange.emit(this.formatRules);
  }

  onFilterByChange(value: string): void {
    if (!value.trim()) {
      this.formatRules.filterBy = undefined;
      this.filterByValid = true;
      this.emit();
      return;
    }
    try {
      this.formatRules.filterBy = JSON.parse(value);
      this.filterByValid = true;
      this.emit();
    } catch {
      this.filterByValid = false;
    }
  }

  onSortGroupByChange(value: string): void {
    if (!value.trim()) {
      this.formatRules.sortGroupBy = undefined;
      this.sortGroupByValid = true;
      this.emit();
      return;
    }
    try {
      this.formatRules.sortGroupBy = JSON.parse(value);
      this.sortGroupByValid = true;
      this.emit();
    } catch {
      this.sortGroupByValid = false;
    }
  }
}
