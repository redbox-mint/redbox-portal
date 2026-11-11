import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { DashboardFieldCatalogue, DashboardFormatRules, DashboardRowConfig } from '../dashboard-config-api.service';

type FilterKind = 'none' | 'user' | 'record';
type SortDirection = '1' | '-1';

interface SearchField {
  name: string;
  path: string;
  template?: string;
  showTemplate: boolean;
  [extra: string]: unknown;
}

interface SearchFieldGroup {
  key: string;
  expected: boolean;
  fields: SearchField[];
  /** Non-text filter entries are kept exactly as they were. */
  otherEntries: unknown[];
}

/** Paths on the signed-in user's info that a "records of the signed-in user" filter can use. */
export const USER_FILTER_PROPERTIES = [
  { path: 'user.email', label: 'admin-dashboard-user-email' },
  { path: 'user.username', label: 'admin-dashboard-user-username' },
  { path: 'user.name', label: 'admin-dashboard-user-full-name' },
];

/**
 * Guided editor for a stage's record filter, overall sort and search fields.
 * Values it does not know about are left untouched.
 */
@Component({
  selector: 'dashboard-filters-editor',
  template: `
    <div class="dc-guided-editor">
      <section class="dc-guided-section">
        <header class="dc-guided-header">
          <h4><i class="fa fa-filter" aria-hidden="true"></i> {{ 'admin-dashboard-filter-title' | i18next }}</h4>
          <p>{{ 'admin-dashboard-filter-help' | i18next }}</p>
        </header>
        <div class="dc-choice-cards" role="radiogroup" [attr.aria-label]="'admin-dashboard-filter-title' | i18next">
          <label class="dc-choice-card" [class.active]="filterKind === 'none'">
            <input
              type="radio"
              [name]="id + '-kind'"
              value="none"
              [(ngModel)]="filterKind"
              (ngModelChange)="onFilterKindChange()"
            />
            <span
              ><strong>{{ 'admin-dashboard-filter-all' | i18next }}</strong
              ><small>{{ 'admin-dashboard-filter-all-help' | i18next }}</small></span
            >
          </label>
          <label class="dc-choice-card" [class.active]="filterKind === 'user'">
            <input
              type="radio"
              [name]="id + '-kind'"
              value="user"
              [(ngModel)]="filterKind"
              (ngModelChange)="onFilterKindChange()"
            />
            <span
              ><strong>{{ 'admin-dashboard-filter-user' | i18next }}</strong
              ><small>{{ 'admin-dashboard-filter-user-help' | i18next }}</small></span
            >
          </label>
          <label class="dc-choice-card" [class.active]="filterKind === 'record'">
            <input
              type="radio"
              [name]="id + '-kind'"
              value="record"
              [(ngModel)]="filterKind"
              (ngModelChange)="onFilterKindChange()"
            />
            <span
              ><strong>{{ 'admin-dashboard-filter-fixed' | i18next }}</strong
              ><small>{{ 'admin-dashboard-filter-fixed-help' | i18next }}</small></span
            >
          </label>
        </div>

        @if (filterKind !== 'none') {
          <div class="dc-sentence-builder">
            <div class="dc-form-group">
              <label class="dc-form-label" [for]="id + '-filter-field'">{{
                'admin-dashboard-record-field' | i18next
              }}</label>
              <dashboard-field-picker
                [inputId]="id + '-filter-field'"
                [catalogue]="catalogue"
                filter="scalar"
                [(value)]="filterField"
                (valueChange)="emitFilter()"
                placeholder="metadata.contributor_ci.email"
              ></dashboard-field-picker>
              <small class="dc-form-help">{{ 'admin-dashboard-filter-field-help' | i18next }}</small>
            </div>
            <div class="dc-form-group">
              <label class="dc-form-label" [for]="id + '-filter-mode'">{{
                'admin-dashboard-filter-must' | i18next
              }}</label>
              <select
                [id]="id + '-filter-mode'"
                class="form-select"
                [(ngModel)]="filterMode"
                (ngModelChange)="emitFilter()"
              >
                <option value="equal">{{ 'admin-dashboard-filter-exact' | i18next }}</option>
                <option value="regex">{{ 'admin-dashboard-filter-contains' | i18next }}</option>
              </select>
            </div>
            @if (filterKind === 'user') {
              <div class="dc-form-group">
                <label class="dc-form-label" [for]="id + '-filter-user'">{{
                  'admin-dashboard-filter-person' | i18next
                }}</label>
                <select
                  [id]="id + '-filter-user'"
                  class="form-select"
                  [(ngModel)]="userProperty"
                  (ngModelChange)="onUserPropertyChange()"
                >
                  @for (property of userProperties; track property) {
                    <option [value]="property.path">{{ property.label | i18next }}</option>
                  }
                  <option value="__custom">{{ 'admin-dashboard-filter-other-property' | i18next }}</option>
                </select>
                @if (userProperty === '__custom') {
                  <input
                    type="text"
                    class="form-control dc-mono dc-mt-6"
                    [(ngModel)]="filterValue"
                    (ngModelChange)="emitFilter()"
                    placeholder="user.someProperty"
                    [attr.aria-label]="'admin-dashboard-user-property-path' | i18next"
                  />
                }
              </div>
            }
            @if (filterKind === 'record') {
              <div class="dc-form-group">
                <label class="dc-form-label" [for]="id + '-filter-value'">{{
                  'admin-dashboard-filter-value' | i18next
                }}</label>
                <input
                  [id]="id + '-filter-value'"
                  type="text"
                  class="form-control"
                  [(ngModel)]="filterValue"
                  (ngModelChange)="emitFilter()"
                  placeholder="rdmp"
                />
              </div>
            }
          </div>
        }
        @if (filterKind !== 'none') {
          <p class="dc-guided-summary" [class.dc-guided-incomplete]="!filterComplete">
            <i
              class="fa"
              aria-hidden="true"
              [class.fa-check-circle]="filterComplete"
              [class.fa-exclamation-circle]="!filterComplete"
            ></i>
            {{ filterSummary }}
          </p>
        }
      </section>

      <section class="dc-guided-section">
        <header class="dc-guided-header">
          <h4>
            <i class="fa fa-sort-amount-desc" aria-hidden="true"></i> {{ 'admin-dashboard-default-order' | i18next }}
          </h4>
          <p>
            @if (columnSort) {
              {{ 'admin-dashboard-column-sort-help' | i18next: { column: columnSort } }}
            }
            @if (!columnSort) {
              {{ 'admin-dashboard-default-order-help' | i18next }}
            }
          </p>
        </header>
        <div class="dc-inline-fields">
          <div class="dc-form-group">
            <label class="dc-form-label" [for]="id + '-sort-field'">{{ 'admin-dashboard-sort-by' | i18next }}</label>
            <select [id]="id + '-sort-field'" class="form-select" [(ngModel)]="sortField" (ngModelChange)="emitSort()">
              <option value="">{{ 'admin-dashboard-sort-default' | i18next }}</option>
              @for (option of sortOptions; track trackSortOption($index, option)) {
                <option [value]="option.value">{{ option.label }}</option>
              }
              <option value="__custom">{{ 'admin-dashboard-sort-other-field' | i18next }}</option>
            </select>
            @if (sortField === '__custom') {
              <dashboard-field-picker
                class="dc-mt-6"
                [catalogue]="catalogue"
                filter="scalar"
                [(value)]="customSortField"
                (valueChange)="emitSort()"
                placeholder="metadata.some.field"
                [ariaLabel]="'admin-dashboard-sort-field-path' | i18next"
              ></dashboard-field-picker>
            }
          </div>
          @if (sortField) {
            <div class="dc-form-group">
              <label class="dc-form-label" [for]="id + '-sort-direction'">{{
                'admin-dashboard-sort-direction' | i18next
              }}</label>
              <select
                [id]="id + '-sort-direction'"
                class="form-select"
                [(ngModel)]="sortDirection"
                (ngModelChange)="emitSort()"
              >
                <option value="-1">{{ 'admin-dashboard-sort-descending' | i18next }}</option>
                <option value="1">{{ 'admin-dashboard-sort-ascending' | i18next }}</option>
              </select>
            </div>
          }
        </div>
      </section>

      <section class="dc-guided-section">
        <header class="dc-guided-header">
          <h4><i class="fa fa-search" aria-hidden="true"></i> {{ 'admin-dashboard-search-fields' | i18next }}</h4>
          @if (targetKind === 'workflow') {
            <p>{{ 'admin-dashboard-search-fields-help' | i18next }}</p>
          }
          @if (targetKind === 'view') {
            <p class="dc-form-help-warning">{{ 'admin-dashboard-search-fields-view-help' | i18next }}</p>
          }
        </header>

        @for (group of searchGroups; track group; let groupIndex = $index) {
          <div class="dc-search-group" [class.dc-search-group-unused]="!group.expected">
            <div class="dc-search-group-title">
              <span>{{ 'admin-dashboard-search-dashboard' | i18next: { dashboard: group.key } }}</span>
              @if (!group.expected) {
                <span class="dc-badge dc-badge-dirty" [attr.title]="'admin-dashboard-search-unused-help' | i18next">{{
                  'admin-dashboard-search-unused' | i18next
                }}</span>
              }
              @if (!group.expected) {
                <button type="button" class="btn btn-link btn-sm" (click)="removeGroup(group)">
                  <i class="fa fa-trash" aria-hidden="true"></i> {{ 'admin-navigation-remove' | i18next }}
                </button>
              }
            </div>
            @if (group.fields.length === 0) {
              <div class="dc-empty-inline">{{ 'admin-dashboard-no-search-fields' | i18next }}</div>
            }
            @for (field of group.fields; track field; let i = $index; let last = $last) {
              <div class="dc-search-field">
                <div class="dc-search-field-row">
                  <input
                    type="text"
                    class="form-control"
                    [(ngModel)]="field.name"
                    (ngModelChange)="emitSearch()"
                    [placeholder]="'admin-dashboard-search-label-placeholder' | i18next"
                    [attr.aria-label]="'admin-dashboard-search-label' | i18next: { index: i + 1 }"
                  />
                  <dashboard-field-picker
                    [catalogue]="catalogue"
                    filter="scalar"
                    [(value)]="field.path"
                    (valueChange)="onSearchPathChange(field)"
                    [placeholder]="'admin-dashboard-search-field-placeholder' | i18next"
                    [ariaLabel]="'admin-dashboard-search-field-label' | i18next: { index: i + 1 }"
                  ></dashboard-field-picker>
                  <div class="dc-row-actions">
                    <button
                      type="button"
                      class="btn btn-outline-secondary btn-sm rb-admin-row-action"
                      (click)="moveField(group, i, -1)"
                      [disabled]="i === 0"
                      [attr.aria-label]="'admin-dashboard-move-search-up' | i18next"
                    >
                      <i class="fa fa-arrow-up" aria-hidden="true"></i>
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-secondary btn-sm rb-admin-row-action"
                      (click)="moveField(group, i, 1)"
                      [disabled]="last"
                      [attr.aria-label]="'admin-dashboard-move-search-down' | i18next"
                    >
                      <i class="fa fa-arrow-down" aria-hidden="true"></i>
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-secondary btn-sm rb-admin-row-action"
                      (click)="removeField(group, i)"
                      [attr.aria-label]="'admin-dashboard-remove-search-field' | i18next"
                    >
                      <i class="fa fa-times" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
                @if (!field.showTemplate) {
                  <button
                    type="button"
                    class="btn btn-link btn-sm dc-template-toggle"
                    (click)="field.showTemplate = true"
                  >
                    {{ 'admin-dashboard-search-transform' | i18next }}
                  </button>
                }
                @if (field.showTemplate) {
                  <div class="dc-form-group">
                    <label class="dc-form-label" [for]="id + '-template-' + groupIndex + '-' + i">{{
                      'admin-dashboard-search-template' | i18next
                    }}</label>
                    <input
                      type="text"
                      class="form-control dc-mono"
                      [id]="id + '-template-' + groupIndex + '-' + i"
                      [(ngModel)]="field.template"
                      (ngModelChange)="emitSearch()"
                      placeholder="{{ templateExample }}"
                      [attr.aria-label]="'admin-dashboard-search-template' | i18next"
                    />
                    <small class="dc-form-help">{{ 'admin-dashboard-search-template-help' | i18next }}</small>
                  </div>
                }
                @if (!field.name.trim() || !field.path.trim()) {
                  <small class="dc-form-help-error">{{ 'admin-dashboard-search-required' | i18next }}</small>
                }
              </div>
            }
            <button type="button" class="btn btn-outline-secondary btn-sm dc-add-search-btn" (click)="addField(group)">
              <i class="fa fa-plus" aria-hidden="true"></i> {{ 'admin-dashboard-add-search-field' | i18next }}
            </button>
          </div>
        }
      </section>

      @if (catalogue) {
        <p class="dc-schema-status">
          <i class="fa fa-info-circle" aria-hidden="true"></i>
          @switch (catalogue.status) {
            @case ('complete') {
              {{
                (catalogue.workflowStage ? 'admin-dashboard-schema-stage' : 'admin-dashboard-schema-complete')
                  | i18next: { recordType: catalogue.recordType, stage: catalogue.workflowStage }
              }}
            }
            @case ('partial') {
              {{ 'admin-dashboard-schema-partial' | i18next: { recordType: catalogue.recordType } }}
            }
            @default {
              {{ 'admin-dashboard-schema-unavailable' | i18next: { reason: catalogue.reason } }}
            }
          }
        </p>
      }
    </div>
  `,
  standalone: false,
})
export class FiltersEditorComponent implements OnChanges {
  constructor(private translation: TranslationService) {}
  static nextId = 0;
  readonly id = `dc-filters-${++FiltersEditorComponent.nextId}`;
  @Input() formatRules: DashboardFormatRules = {};
  @Input() columns: DashboardRowConfig[] = [];
  @Input() targetKind: 'workflow' | 'view' = 'workflow';
  @Input() queryFilterKeys: string[] = [];
  @Input() catalogue: DashboardFieldCatalogue | null = null;
  @Output() formatRulesChange = new EventEmitter<DashboardFormatRules>();

  readonly userProperties = USER_FILTER_PROPERTIES;
  readonly templateExample = '{{value}}';

  filterKind: FilterKind = 'none';
  filterField = '';
  filterMode = 'equal';
  filterValue = '';
  userProperty = USER_FILTER_PROPERTIES[0].path;

  sortField = '';
  customSortField = '';
  sortDirection: SortDirection = '-1';

  searchGroups: SearchFieldGroup[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['formatRules'] || changes['queryFilterKeys']) {
      this.formatRules = this.formatRules ?? {};
      this.readFilter();
      this.readSort();
      this.readSearchFields();
    }
  }

  // --- Record filter -----------------------------------------------------

  private readFilter(): void {
    const filter = (this.formatRules.filterBy ?? {}) as Record<string, unknown>;
    const base = filter['filterBase'];
    this.filterKind = base === 'user' ? 'user' : base === 'record' ? 'record' : 'none';
    this.filterField = String(filter['filterField'] ?? '');
    this.filterMode = filter['filterMode'] === 'regex' ? 'regex' : 'equal';
    this.filterValue = String(filter['filterBaseFieldOrValue'] ?? '');
    if (this.filterKind === 'user') {
      this.userProperty = USER_FILTER_PROPERTIES.some(p => p.path === this.filterValue) ? this.filterValue : '__custom';
    }
  }

  onFilterKindChange(): void {
    if (this.filterKind === 'user') {
      this.userProperty = USER_FILTER_PROPERTIES[0].path;
      this.filterValue = this.userProperty;
    } else if (this.filterKind === 'record') {
      this.filterValue = '';
    }
    this.emitFilter();
  }

  onUserPropertyChange(): void {
    if (this.userProperty !== '__custom') {
      this.filterValue = this.userProperty;
    } else {
      this.filterValue = '';
    }
    this.emitFilter();
  }

  get filterComplete(): boolean {
    return !!this.filterField.trim() && !!this.filterValue.trim();
  }

  get filterSummary(): string {
    if (!this.filterComplete) return this.translation.t('admin-dashboard-filter-incomplete');
    const property = USER_FILTER_PROPERTIES.find(p => p.path === this.filterValue);
    const value =
      this.filterKind === 'user'
        ? this.translation.t('admin-dashboard-filter-user-value', {
            property: property ? this.translation.t(property.label) : this.filterValue,
          })
        : `"${this.filterValue}"`;
    return this.translation.t(
      this.filterMode === 'equal' ? 'admin-dashboard-filter-summary-equal' : 'admin-dashboard-filter-summary-contains',
      { field: this.filterField, value, interpolation: { escapeValue: false } }
    );
  }

  emitFilter(): void {
    if (this.filterKind === 'none') {
      delete this.formatRules.filterBy;
    } else {
      // Keep any extra properties an existing filter had.
      this.formatRules.filterBy = {
        ...((this.formatRules.filterBy ?? {}) as Record<string, unknown>),
        filterBase: this.filterKind,
        filterBaseFieldOrValue: this.filterValue.trim(),
        filterField: this.filterField.trim(),
        filterMode: this.filterMode,
      };
    }
    this.formatRulesChange.emit(this.formatRules);
  }

  // --- Default order -----------------------------------------------------

  get sortOptions(): Array<{ value: string; label: string }> {
    const options = (this.columns ?? [])
      .filter(c => c.variable)
      .map(c => ({ value: c.variable, label: `${c.title || c.variable} (${c.variable})` }));
    const standard = [
      { value: 'metaMetadata.lastSaveDate', label: this.translation.t('admin-dashboard-sort-modified') },
      { value: 'metaMetadata.createdOn', label: this.translation.t('admin-dashboard-sort-created') },
      ...(this.catalogue?.fields.some(f => f.path === 'metadata.title') ||
      !this.catalogue ||
      this.catalogue.status === 'unavailable'
        ? [{ value: 'metadata.title', label: this.translation.t('admin-dashboard-sort-title') }]
        : []),
    ];
    for (const option of standard) {
      if (!options.some(o => o.value === option.value)) {
        options.push(option);
      }
    }
    return options;
  }

  // Angular schedules select writes after rendering. Retain the option nodes
  // when deriving labels from editable columns so those writes can settle.
  trackSortOption(index: number, option: { value: string }): string {
    return option.value;
  }

  get columnSort(): string {
    const column =
      (this.columns ?? []).find(c => c.defaultSort && (c.initialSort === 'asc' || c.initialSort === 'desc')) ??
      (this.columns ?? []).find(c => c.initialSort === 'asc' || c.initialSort === 'desc');
    return column ? column.title || column.variable : '';
  }

  private readSort(): void {
    const value = String(this.formatRules.sortBy ?? '').trim();
    if (!value) {
      this.sortField = '';
      this.sortDirection = '-1';
      return;
    }
    const [field, direction] = value.split(':');
    this.sortDirection = direction === '1' ? '1' : '-1';
    if (this.sortOptions.some(o => o.value === field)) {
      this.sortField = field;
    } else {
      this.sortField = '__custom';
      this.customSortField = field;
    }
  }

  emitSort(): void {
    const field = this.sortField === '__custom' ? this.customSortField.trim() : this.sortField;
    if (!field) {
      delete this.formatRules.sortBy;
    } else {
      this.formatRules.sortBy = `${field}:${this.sortDirection}`;
    }
    this.formatRulesChange.emit(this.formatRules);
  }

  // --- Search fields -----------------------------------------------------

  private readSearchFields(): void {
    const queryFilters = (this.formatRules.queryFilters ?? {}) as Record<string, Array<Record<string, any>>>;
    const keys = [
      ...this.queryFilterKeys.filter(k => !!k),
      ...Object.keys(queryFilters).filter(k => !this.queryFilterKeys.includes(k)),
    ];
    this.searchGroups = keys.map(key => {
      const entries = Array.isArray(queryFilters[key]) ? queryFilters[key] : [];
      const textEntries = entries.filter(e => (e?.['filterType'] ?? 'text') === 'text');
      return {
        key,
        expected: this.queryFilterKeys.includes(key),
        otherEntries: entries.filter(e => !textEntries.includes(e)),
        fields: textEntries
          .flatMap(e => (Array.isArray(e?.['filterFields']) ? e['filterFields'] : []))
          .map((f: Record<string, unknown>) => ({
            ...f,
            name: String(f['name'] ?? ''),
            path: String(f['path'] ?? ''),
            template: f['template'] as string | undefined,
            showTemplate: !!f['template'],
          })),
      };
    });
  }

  /** Offer the schema label when a field is picked and no label was typed yet. */
  onSearchPathChange(field: SearchField): void {
    const known = this.catalogue?.fields.find(f => f.path === field.path.trim());
    if (known && !field.name.trim()) {
      field.name = known.label.split(' › ').pop() ?? known.label;
    }
    this.emitSearch();
  }

  addField(group: SearchFieldGroup): void {
    group.fields.push({ name: '', path: '', showTemplate: false });
    this.emitSearch();
  }

  removeField(group: SearchFieldGroup, index: number): void {
    group.fields.splice(index, 1);
    this.emitSearch();
  }

  moveField(group: SearchFieldGroup, index: number, delta: number): void {
    const [field] = group.fields.splice(index, 1);
    group.fields.splice(index + delta, 0, field);
    this.emitSearch();
  }

  removeGroup(group: SearchFieldGroup): void {
    this.searchGroups = this.searchGroups.filter(g => g !== group);
    this.emitSearch();
  }

  emitSearch(): void {
    const queryFilters: Record<string, unknown[]> = {};
    for (const group of this.searchGroups) {
      const fields = group.fields.map(({ showTemplate, template, ...rest }) => {
        const field: Record<string, unknown> = { ...rest, name: rest.name.trim(), path: rest.path.trim() };
        if (template && template.trim()) {
          field['template'] = template;
        }
        return field;
      });
      const entries = [...(fields.length ? [{ filterType: 'text', filterFields: fields }] : []), ...group.otherEntries];
      if (entries.length) {
        queryFilters[group.key] = entries;
      }
    }
    if (Object.keys(queryFilters).length) {
      this.formatRules.queryFilters = queryFilters;
    } else {
      delete this.formatRules.queryFilters;
    }
    this.formatRulesChange.emit(this.formatRules);
  }
}
