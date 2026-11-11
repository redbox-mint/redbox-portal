import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { NamedQueryCatalogueRow } from '../named-query-api.service';

export type NamedQueryListQueryState = {
  searchTerm: string;
  collection?: string;
};

@Component({
  selector: 'nq-list',
  templateUrl: './nq-list.component.html',
  styleUrls: ['./nq-list.component.scss'],
  standalone: false
})
export class NqListComponent implements OnChanges, OnDestroy {
  @Input() brandingAndPortalUrl = '';
  @Input() queries: NamedQueryCatalogueRow[] = [];
  @Input() total = 0;
  @Input() collections: string[] = [];
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

  clearFilters(): void {
    this.searchTerm = '';
    this.setCollection('');
  }

  setCollection(collection: string): void {
    if (this.searchDebounceTimer) { clearTimeout(this.searchDebounceTimer); this.searchDebounceTimer = null; }
    this.queryChanged.emit({ searchTerm: this.searchTerm, collection });
  }

  onSearchTermChanged(value: string): void {
    this.searchTerm = value;
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.searchDebounceTimer = null;
      this.queryChanged.emit({ searchTerm: this.searchTerm, ...(this.query.collection ? { collection: this.query.collection } : {}) });
    }, 250);
  }

  sourceLabel(query: NamedQueryCatalogueRow): string {
    return query.valid === false ? 'named-query-invalid-source' : query.source === 'graphql' ? 'named-query-source-graphql' : 'named-query-source-database';
  }
  collectionLabel(query: NamedQueryCatalogueRow): string {
    if (query.valid === false || query.source === 'graphql') return '—';
    return ['record', 'user'].includes(query.collectionName) ? 'admin-query-collection-' + query.collectionName : query.collectionName || '—';
  }

  paramCount(q: NamedQueryCatalogueRow): number {
    if (q.valid === false) return 0;
    if (q.source === 'graphql') return Object.values(q.graphql?.variables ?? {}).filter(binding => binding?.ownership === 'consumer').length;
    return q.queryParams ? Object.keys(q.queryParams).length : 0;
  }

  filterCount(q: NamedQueryCatalogueRow): number {
    if (q.valid === false) return 0;
    return q.relatedRecordFilters ? q.relatedRecordFilters.length : 0;
  }

  mappingCount(q: NamedQueryCatalogueRow): number {
    if (q.valid === false) return 0;
    if (q.source === 'graphql') return Object.keys(q.graphql?.mappings ?? {}).length;
    return q.resultObjectMapping ? Object.keys(q.resultObjectMapping).length : 0;
  }

  trackByName(_index: number, q: NamedQueryCatalogueRow): string {
    return q?.name || `named-query-${_index}`;
  }
}
