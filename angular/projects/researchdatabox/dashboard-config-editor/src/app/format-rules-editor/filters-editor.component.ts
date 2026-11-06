import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
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
  { path: 'user.email', label: 'Email address' },
  { path: 'user.username', label: 'Username' },
  { path: 'user.name', label: 'Full name' }
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
          <h5><i class="fa fa-filter" aria-hidden="true"></i> Which records are listed</h5>
          <p>Applies whenever nobody is searching. People only ever see records they have permission to view.</p>
        </header>
        <div class="dc-choice-cards" role="radiogroup" aria-label="Which records are listed">
          <label class="dc-choice-card" [class.active]="filterKind === 'none'">
            <input type="radio" name="dc-filter-kind" value="none" [(ngModel)]="filterKind" (ngModelChange)="onFilterKindChange()" />
            <span><strong>All records</strong><small>Every record in this stage that the person can see.</small></span>
          </label>
          <label class="dc-choice-card" [class.active]="filterKind === 'user'">
            <input type="radio" name="dc-filter-kind" value="user" [(ngModel)]="filterKind" (ngModelChange)="onFilterKindChange()" />
            <span><strong>Records linked to the signed-in person</strong><small>For example, plans where they are the chief investigator.</small></span>
          </label>
          <label class="dc-choice-card" [class.active]="filterKind === 'record'">
            <input type="radio" name="dc-filter-kind" value="record" [(ngModel)]="filterKind" (ngModelChange)="onFilterKindChange()" />
            <span><strong>Records with a fixed value</strong><small>For example, only records of one type.</small></span>
          </label>
        </div>

        <div class="dc-sentence-builder" *ngIf="filterKind !== 'none'">
          <div class="dc-form-group">
            <label class="dc-form-label" for="dc-filter-field">Record field</label>
            <dashboard-field-picker inputId="dc-filter-field" [catalogue]="catalogue" filter="scalar" [(value)]="filterField" (valueChange)="emitFilter()" placeholder="metadata.contributor_ci.email"></dashboard-field-picker>
            <small class="dc-form-help">The value in each record to compare.</small>
          </div>
          <div class="dc-form-group">
            <label class="dc-form-label" for="dc-filter-mode">Must</label>
            <select id="dc-filter-mode" class="form-control" [(ngModel)]="filterMode" (ngModelChange)="emitFilter()">
              <option value="equal">exactly match</option>
              <option value="regex">contain (ignoring case)</option>
            </select>
          </div>
          <div class="dc-form-group" *ngIf="filterKind === 'user'">
            <label class="dc-form-label" for="dc-filter-user">The signed-in person's</label>
            <select id="dc-filter-user" class="form-control" [(ngModel)]="userProperty" (ngModelChange)="onUserPropertyChange()">
              <option *ngFor="let property of userProperties" [value]="property.path">{{ property.label }}</option>
              <option value="__custom">Other property…</option>
            </select>
            <input *ngIf="userProperty === '__custom'" type="text" class="form-control dc-mono dc-mt-6" [(ngModel)]="filterValue" (ngModelChange)="emitFilter()" placeholder="user.someProperty" aria-label="User property path" />
          </div>
          <div class="dc-form-group" *ngIf="filterKind === 'record'">
            <label class="dc-form-label" for="dc-filter-value">Value</label>
            <input id="dc-filter-value" type="text" class="form-control" [(ngModel)]="filterValue" (ngModelChange)="emitFilter()" placeholder="rdmp" />
          </div>
        </div>
        <p class="dc-guided-summary" *ngIf="filterKind !== 'none'" [class.dc-guided-incomplete]="!filterComplete">
          <i class="fa" aria-hidden="true" [class.fa-check-circle]="filterComplete" [class.fa-exclamation-circle]="!filterComplete"></i>
          {{ filterSummary }}
        </p>
      </section>

      <section class="dc-guided-section">
        <header class="dc-guided-header">
          <h5><i class="fa fa-sort-amount-desc" aria-hidden="true"></i> Default order</h5>
          <p>
            <ng-container *ngIf="columnSort">{{ 'admin-dashboard-column-sort-help' | i18next: { column: columnSort } }}</ng-container>
            <ng-container *ngIf="!columnSort">No column declares an initial sort, so this order is used.</ng-container>
          </p>
        </header>
        <div class="dc-inline-fields">
          <div class="dc-form-group">
            <label class="dc-form-label" for="dc-sort-field">Sort by</label>
            <select id="dc-sort-field" class="form-control" [(ngModel)]="sortField" (ngModelChange)="emitSort()">
              <option value="">Last modified (default)</option>
              <option *ngFor="let option of sortOptions; trackBy: trackSortOption" [value]="option.value">{{ option.label }}</option>
              <option value="__custom">Other field…</option>
            </select>
            <dashboard-field-picker *ngIf="sortField === '__custom'" class="dc-mt-6" [catalogue]="catalogue" filter="scalar" [(value)]="customSortField" (valueChange)="emitSort()" placeholder="metadata.some.field" ariaLabel="Sort field path"></dashboard-field-picker>
          </div>
          <div class="dc-form-group" *ngIf="sortField">
            <label class="dc-form-label" for="dc-sort-direction">Direction</label>
            <select id="dc-sort-direction" class="form-control" [(ngModel)]="sortDirection" (ngModelChange)="emitSort()">
              <option value="-1">Descending (newest / Z–A first)</option>
              <option value="1">Ascending (oldest / A–Z first)</option>
            </select>
          </div>
        </div>
      </section>

      <section class="dc-guided-section">
        <header class="dc-guided-header">
          <h5><i class="fa fa-search" aria-hidden="true"></i> Search fields</h5>
          <p *ngIf="targetKind === 'workflow'">Fields people can choose in the "Filter by" menu above the table. With none, the search box searches record titles. Turn the search box on or off under Display.</p>
          <p *ngIf="targetKind === 'view'" class="dc-form-help-warning">Custom views do not show a search box, so these fields have no effect here.</p>
        </header>

        <div *ngFor="let group of searchGroups" class="dc-search-group" [class.dc-search-group-unused]="!group.expected">
          <div class="dc-search-group-title">
            <span>Used on the <strong>{{ group.key }}</strong> dashboard</span>
            <span class="dc-badge dc-badge-dirty" *ngIf="!group.expected" title="This dashboard page does not use these fields">not used here</span>
            <button type="button" class="btn btn-link btn-sm" *ngIf="!group.expected" (click)="removeGroup(group)"><i class="fa fa-trash" aria-hidden="true"></i> {{ 'admin-navigation-remove' | i18next }}</button>
          </div>
          <div *ngIf="group.fields.length === 0" class="dc-empty-inline">No search fields — searches record titles.</div>
          <div class="dc-search-field" *ngFor="let field of group.fields; let i = index; let last = last">
            <div class="dc-search-field-row">
              <input type="text" class="form-control" [(ngModel)]="field.name" (ngModelChange)="emitSearch()" placeholder="Label, e.g. Title" [attr.aria-label]="'Label for search field ' + (i + 1)" />
              <dashboard-field-picker [catalogue]="catalogue" filter="scalar" [(value)]="field.path" (valueChange)="onSearchPathChange(field)" placeholder="Record field, e.g. metadata.title" [ariaLabel]="'Record field for search field ' + (i + 1)"></dashboard-field-picker>
              <div class="dc-row-actions">
                <button type="button" class="btn btn-outline-secondary btn-sm rb-admin-row-action" (click)="moveField(group, i, -1)" [disabled]="i === 0" [attr.aria-label]="'admin-dashboard-move-search-up' | i18next"><i class="fa fa-arrow-up" aria-hidden="true"></i></button>
                <button type="button" class="btn btn-outline-secondary btn-sm rb-admin-row-action" (click)="moveField(group, i, 1)" [disabled]="last" [attr.aria-label]="'admin-dashboard-move-search-down' | i18next"><i class="fa fa-arrow-down" aria-hidden="true"></i></button>
                <button type="button" class="btn btn-outline-secondary btn-sm rb-admin-row-action" (click)="removeField(group, i)" [attr.aria-label]="'admin-dashboard-remove-search-field' | i18next"><i class="fa fa-times" aria-hidden="true"></i></button>
              </div>
            </div>
            <button type="button" class="btn btn-link btn-xs dc-template-toggle" *ngIf="!field.showTemplate" (click)="field.showTemplate = true">Transform the typed text (advanced)</button>
            <div class="dc-form-group" *ngIf="field.showTemplate">
              <label class="dc-form-label">Search text template</label>
              <input type="text" class="form-control dc-mono" [(ngModel)]="field.template" (ngModelChange)="emitSearch()" placeholder="{{ templateExample }}" aria-label="Search text template" />
              <small class="dc-form-help">Handlebars; <code>value</code> is what the person typed. Leave empty to search for the typed text as-is.</small>
            </div>
            <small class="dc-form-help-error" *ngIf="!field.name.trim() || !field.path.trim()">Give this field a label and a record field.</small>
          </div>
          <button type="button" class="btn btn-outline-secondary btn-sm" (click)="addField(group)"><i class="fa fa-plus" aria-hidden="true"></i> Add search field</button>
        </div>
      </section>

      <p class="dc-schema-status" *ngIf="catalogue">
        <i class="fa fa-info-circle" aria-hidden="true"></i>
        <ng-container [ngSwitch]="catalogue.status">
          <ng-container *ngSwitchCase="'complete'">Field suggestions come from the {{ catalogue.recordType }} record schema{{ catalogue.workflowStage ? ' at stage ' + catalogue.workflowStage : '' }}.</ng-container>
          <ng-container *ngSwitchCase="'partial'">Field suggestions come from the {{ catalogue.recordType }} record schema. Some form components are not described, so fields under them are not checked.</ng-container>
          <ng-container *ngSwitchDefault>The record schema is not available here ({{ catalogue.reason }}), so fields cannot be suggested or checked.</ng-container>
        </ng-container>
      </p>
    </div>
  `,
  standalone: false
})
export class FiltersEditorComponent implements OnChanges {
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
      this.userProperty = USER_FILTER_PROPERTIES.some((p) => p.path === this.filterValue) ? this.filterValue : '__custom';
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
    if (!this.filterComplete) {
      return 'Choose a record field and a value to finish this filter. Until then the filter is not valid and cannot be saved.';
    }
    const mode = this.filterMode === 'equal' ? 'exactly matches' : 'contains';
    const value = this.filterKind === 'user'
      ? `the signed-in person's ${USER_FILTER_PROPERTIES.find((p) => p.path === this.filterValue)?.label.toLowerCase() ?? this.filterValue}`
      : `"${this.filterValue}"`;
    return `Lists records where ${this.filterField} ${mode} ${value}.`;
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
        filterMode: this.filterMode
      };
    }
    this.formatRulesChange.emit(this.formatRules);
  }

  // --- Default order -----------------------------------------------------

  get sortOptions(): Array<{ value: string; label: string }> {
    const options = (this.columns ?? []).filter((c) => c.variable).map((c) => ({ value: c.variable, label: `${c.title || c.variable} (${c.variable})` }));
    const standard = [
      { value: 'metaMetadata.lastSaveDate', label: 'Last modified (metaMetadata.lastSaveDate)' },
      { value: 'metaMetadata.createdOn', label: 'Created (metaMetadata.createdOn)' },
      ...(this.catalogue?.fields.some((f) => f.path === 'metadata.title') || !this.catalogue || this.catalogue.status === 'unavailable'
        ? [{ value: 'metadata.title', label: 'Title (metadata.title)' }]
        : [])
    ];
    for (const option of standard) {
      if (!options.some((o) => o.value === option.value)) {
        options.push(option);
      }
    }
    return options;
  }

  // Angular schedules select writes after rendering. Retain the option nodes
  // when deriving labels from editable columns so those writes can settle.
  trackSortOption(index: number, option: { value: string }): string { return option.value; }

  get columnSort(): string {
    const column = (this.columns ?? []).find((c) => c.defaultSort && (c.initialSort === 'asc' || c.initialSort === 'desc'))
      ?? (this.columns ?? []).find((c) => c.initialSort === 'asc' || c.initialSort === 'desc');
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
    if (this.sortOptions.some((o) => o.value === field)) {
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
    const keys = [...this.queryFilterKeys.filter((k) => !!k), ...Object.keys(queryFilters).filter((k) => !this.queryFilterKeys.includes(k))];
    this.searchGroups = keys.map((key) => {
      const entries = Array.isArray(queryFilters[key]) ? queryFilters[key] : [];
      const textEntries = entries.filter((e) => (e?.['filterType'] ?? 'text') === 'text');
      return {
        key,
        expected: this.queryFilterKeys.includes(key),
        otherEntries: entries.filter((e) => !textEntries.includes(e)),
        fields: textEntries.flatMap((e) => (Array.isArray(e?.['filterFields']) ? e['filterFields'] : [])).map((f: Record<string, unknown>) => ({
          ...f,
          name: String(f['name'] ?? ''),
          path: String(f['path'] ?? ''),
          template: f['template'] as string | undefined,
          showTemplate: !!f['template']
        }))
      };
    });
  }

  /** Offer the schema label when a field is picked and no label was typed yet. */
  onSearchPathChange(field: SearchField): void {
    const known = this.catalogue?.fields.find((f) => f.path === field.path.trim());
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
    this.searchGroups = this.searchGroups.filter((g) => g !== group);
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
