import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { DashboardFormatRules } from '../dashboard-config-api.service';

@Component({
  selector: 'format-rules-editor',
  template: `
    <div class="dc-format-rules-editor">
      <ng-container *ngIf="section === 'filters'">
        <header class="dc-format-rules-header">
          <h5 class="dc-format-rules-title">
            <i class="fa fa-sliders"></i>
            Filters, sorting and search
          </h5>
          <small class="dc-format-rules-subtitle">Which records this dashboard lists, how they are sorted, and which fields users can search.</small>
        </header>

        <div class="dc-format-rules-grid">
          <div class="form-group">
            <label class="dc-form-label" for="dc-sort-by">Overall sort</label>
            <input id="dc-sort-by" type="text" class="form-control" [(ngModel)]="formatRules.sortBy" placeholder="e.g. metaMetadata.lastSaveDate:-1" (ngModelChange)="onTextChange('sortBy', $event)" />
            <small class="dc-form-help">Used when no column declares an initial sort. Format <code>field:1</code> (ascending) or <code>field:-1</code> (descending). Empty means last modified first.</small>
          </div>
          <div class="form-group dc-format-rules-full">
            <label class="dc-form-label" for="dc-filter-by">
              Record filter
              <span class="dc-json-hint" [class.invalid]="!filterByValid">JSON</span>
            </label>
            <textarea id="dc-filter-by" class="form-control dc-mono" rows="4" [(ngModel)]="filterByJson" (ngModelChange)="onJsonChange('filterBy', $event)" placeholder='{ "filterBase": "user", "filterBaseFieldOrValue": "user.email", "filterField": "metadata.contributor_ci.email", "filterMode": "equal" }'></textarea>
            <small class="dc-form-help" [class.dc-form-help-error]="!filterByValid">
              <ng-container *ngIf="filterByValid">Limits the records listed when nobody is searching. Leave empty for no filter.</ng-container>
              <ng-container *ngIf="!filterByValid">Invalid JSON — this change has not been applied.</ng-container>
            </small>
          </div>
          <div class="form-group dc-format-rules-full">
            <label class="dc-form-label" for="dc-query-filters">
              Search filter fields
              <span class="dc-json-hint" [class.invalid]="!queryFiltersValid">JSON</span>
            </label>
            <textarea id="dc-query-filters" class="form-control dc-mono" rows="6" [(ngModel)]="queryFiltersJson" (ngModelChange)="onJsonChange('queryFilters', $event)" placeholder='{ "rdmp": [{ "filterType": "text", "filterFields": [{ "name": "Title", "path": "metadata.title" }] }] }'></textarea>
            <small class="dc-form-help" [class.dc-form-help-error]="!queryFiltersValid">
              <ng-container *ngIf="queryFiltersValid">Fields offered in the "Filter by" menu, keyed by the record type of the dashboard page<ng-container *ngIf="queryFilterKeys.length"> (this dashboard uses {{ queryFilterKeys.join(' or ') }})</ng-container>. Empty means search by title.</ng-container>
              <ng-container *ngIf="!queryFiltersValid">Invalid JSON — this change has not been applied.</ng-container>
            </small>
          </div>
        </div>
      </ng-container>

      <ng-container *ngIf="section === 'grouping'">
        <header class="dc-format-rules-header">
          <h5 class="dc-format-rules-title">
            <i class="fa fa-object-group"></i>
            Grouping
          </h5>
          <small class="dc-format-rules-subtitle" *ngIf="targetKind === 'view'">Group related records together in this view step.</small>
          <small class="dc-format-rules-subtitle dc-form-help-warning" *ngIf="targetKind === 'workflow'">Grouping is only applied by custom views. Workflow stage dashboards list records without grouping.</small>
        </header>
        <div class="dc-format-rules-grid">
          <div class="form-group">
            <label class="dc-form-label" for="dc-group-by">Group by</label>
            <select id="dc-group-by" class="form-control" [(ngModel)]="groupBy" (ngModelChange)="onTextChange('groupBy', $event)">
              <option value="">No grouping</option>
              <option value="groupedByRecordType">Record type</option>
              <option value="groupedByRelationships">Related records</option>
            </select>
          </div>
          <div class="form-group dc-format-rules-full">
            <label class="dc-form-label" for="dc-sort-group-by">
              Group levels
              <span class="dc-json-hint" [class.invalid]="!sortGroupByValid">JSON</span>
            </label>
            <textarea id="dc-sort-group-by" class="form-control dc-mono" rows="4" [(ngModel)]="sortGroupByJson" (ngModelChange)="onJsonChange('sortGroupBy', $event)" placeholder='[{ "rowLevel": 0, "compareFieldValue": "rdmp" }]'></textarea>
            <small class="dc-form-help" [class.dc-form-help-error]="!sortGroupByValid">
              <ng-container *ngIf="sortGroupByValid">One entry per level, in order.</ng-container>
              <ng-container *ngIf="!sortGroupByValid">Invalid JSON — this change has not been applied.</ng-container>
            </small>
          </div>
        </div>
      </ng-container>
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
    .dc-form-help-warning {
      color: var(--dc-warning, #d97706);
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
  @Input() section: 'filters' | 'grouping' = 'filters';
  @Input() targetKind: 'workflow' | 'view' = 'workflow';
  @Input() queryFilterKeys: string[] = [];
  @Output() formatRulesChange = new EventEmitter<DashboardFormatRules>();

  filterByJson = '';
  queryFiltersJson = '';
  sortGroupByJson = '';
  filterByValid = true;
  queryFiltersValid = true;
  sortGroupByValid = true;
  groupBy = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['formatRules']) {
      this.syncJson();
    }
  }

  private toJson(value: unknown): string {
    return value === undefined ? '' : JSON.stringify(value, null, 2);
  }

  private syncJson(): void {
    this.formatRules = this.formatRules ?? {};
    this.filterByJson = this.toJson(this.formatRules.filterBy);
    this.queryFiltersJson = this.toJson(this.formatRules.queryFilters);
    this.sortGroupByJson = this.toJson(this.formatRules.sortGroupBy);
    this.groupBy = this.formatRules.groupBy ?? '';
    this.filterByValid = this.queryFiltersValid = this.sortGroupByValid = true;
  }

  private setValid(field: 'filterBy' | 'queryFilters' | 'sortGroupBy', valid: boolean): void {
    if (field === 'filterBy') {
      this.filterByValid = valid;
    } else if (field === 'queryFilters') {
      this.queryFiltersValid = valid;
    } else {
      this.sortGroupByValid = valid;
    }
  }

  /** Clearing a field removes the setting; nothing is filled in from elsewhere. */
  onTextChange(field: 'sortBy' | 'groupBy', value: string): void {
    if (value === '' || value === undefined || value === null) {
      delete this.formatRules[field];
    } else {
      this.formatRules[field] = value;
    }
    this.formatRulesChange.emit(this.formatRules);
  }

  onJsonChange(field: 'filterBy' | 'queryFilters' | 'sortGroupBy', value: string): void {
    if (!value.trim()) {
      delete this.formatRules[field];
      this.setValid(field, true);
      this.formatRulesChange.emit(this.formatRules);
      return;
    }
    try {
      (this.formatRules as Record<string, unknown>)[field] = JSON.parse(value);
      this.setValid(field, true);
      this.formatRulesChange.emit(this.formatRules);
    } catch {
      this.setValid(field, false);
    }
  }
}
