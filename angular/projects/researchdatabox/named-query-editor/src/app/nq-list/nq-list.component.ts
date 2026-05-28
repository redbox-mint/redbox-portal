import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { NamedQueryDefinition } from '../named-query-api.service';

export type NamedQueryListQueryState = {
  searchTerm: string;
};

@Component({
  selector: 'nq-list',
  templateUrl: './nq-list.component.html',
  styleUrls: ['./nq-list.component.scss'],
  standalone: false
})
export class NqListComponent implements OnChanges, OnDestroy {
  @Input() queries: NamedQueryDefinition[] = [];
  @Input() selectedName: string | null = null;
  @Input() query: NamedQueryListQueryState = { searchTerm: '' };

  @Output() selected = new EventEmitter<string>();
  @Output() deleted = new EventEmitter<string>();
  @Output() queryChanged = new EventEmitter<NamedQueryListQueryState>();

  searchTerm = '';
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if ('query' in changes && this.query) {
      this.searchTerm = this.query.searchTerm;
    }
  }

  ngOnDestroy(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }

  open(name: string | undefined): void {
    if (name) {
      this.selected.emit(name);
    }
  }

  remove(name: string | undefined): void {
    if (name) {
      this.deleted.emit(name);
    }
  }

  onSearchTermChanged(value: string): void {
    this.searchTerm = value;
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.searchDebounceTimer = null;
      this.queryChanged.emit({ searchTerm: this.searchTerm });
    }, 250);
  }

  paramCount(q: NamedQueryDefinition): number {
    return q.queryParams ? Object.keys(q.queryParams).length : 0;
  }

  filterCount(q: NamedQueryDefinition): number {
    return q.relatedRecordFilters ? q.relatedRecordFilters.length : 0;
  }

  mappingCount(q: NamedQueryDefinition): number {
    return q.resultObjectMapping ? Object.keys(q.resultObjectMapping).length : 0;
  }

  trackByName(_index: number, q: NamedQueryDefinition): string {
    return q?.name || `named-query-${_index}`;
  }
}
