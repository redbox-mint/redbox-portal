import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';

interface RelatedRecordFilterDefinition {
  collectionName: string;
  mongoQuery: Record<string, unknown>;
  localField: string;
  foreignField: string;
}

interface FilterEntry extends RelatedRecordFilterDefinition {
  id: number;
  mongoQueryJson: string;
}

@Component({
  selector: 'related-filter-editor',
  templateUrl: './related-filter-editor.component.html',
  standalone: false
})
export class RelatedFilterEditorComponent implements OnChanges {
  @Input() relatedRecordFilters: RelatedRecordFilterDefinition[] | undefined = [];
  @Output() relatedRecordFiltersChange = new EventEmitter<RelatedRecordFilterDefinition[] | undefined>();

  filters: FilterEntry[] = [];
  expandedId: number | null = null;
  private nextEntryId = 1;
  private lastEmitted: RelatedRecordFilterDefinition[] | undefined | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if ('relatedRecordFilters' in changes) {
      if (this.relatedRecordFilters === this.lastEmitted) {
        return;
      }
      this.rebuildFilters();
    }
  }

  trackById(_index: number, filter: FilterEntry): number {
    return filter.id;
  }

  toggleExpand(filter: FilterEntry): void {
    this.expandedId = this.expandedId === filter.id ? null : filter.id;
  }

  onFieldChange(filter: FilterEntry, field: 'collectionName' | 'localField' | 'foreignField', value: string): void {
    filter[field] = value;
    this.emitFromFilters();
  }

  onMongoQueryJsonChange(filter: FilterEntry, jsonStr: string): void {
    filter.mongoQueryJson = jsonStr;
    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        filter.mongoQuery = parsed as Record<string, unknown>;
        this.emitFromFilters();
      }
    } catch {
      // leave the underlying mongoQuery untouched while the JSON is invalid;
      // the textarea continues to reflect the user's typed text.
    }
  }

  addFilter(): void {
    const id = this.nextEntryId++;
    this.filters = [...this.filters, {
      id,
      collectionName: '',
      mongoQuery: {},
      mongoQueryJson: '{}',
      localField: '',
      foreignField: ''
    }];
    this.expandedId = id;
    this.emitFromFilters();
  }

  removeFilter(filter: FilterEntry): void {
    this.filters = this.filters.filter(f => f.id !== filter.id);
    if (this.expandedId === filter.id) {
      this.expandedId = null;
    }
    this.emitFromFilters();
  }

  private emitFromFilters(): void {
    const value = this.filters.length > 0
      ? this.filters.map(f => ({
          collectionName: f.collectionName,
          mongoQuery: f.mongoQuery,
          localField: f.localField,
          foreignField: f.foreignField
        }))
      : undefined;
    this.lastEmitted = value;
    this.relatedRecordFilters = value;
    this.relatedRecordFiltersChange.emit(value);
  }

  private rebuildFilters(): void {
    const list = this.relatedRecordFilters || [];
    this.filters = list.map(f => ({
      id: this.nextEntryId++,
      collectionName: f.collectionName,
      mongoQuery: f.mongoQuery,
      mongoQueryJson: JSON.stringify(f.mongoQuery || {}, null, 2),
      localField: f.localField,
      foreignField: f.foreignField
    }));
  }
}
