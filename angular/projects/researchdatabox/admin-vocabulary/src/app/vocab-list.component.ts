import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { VocabularySummary } from './vocabulary-api.service';

type SourceFilter = 'all' | 'local' | 'rva';
type TypeFilter = 'all' | 'flat' | 'tree';
type VocabularyListQueryState = {
  searchTerm: string;
  sourceFilter: SourceFilter;
  typeFilter: TypeFilter;
};

@Component({
  selector: 'vocab-list',
  templateUrl: './vocab-list.component.html',
  styleUrls: ['./vocab-list.component.scss'],
  standalone: false
})
export class VocabListComponent implements OnChanges, OnDestroy {
  @Input() vocabularies: VocabularySummary[] = [];
  @Input() selectedId: string | null = null;
  @Input() totalCount = 0;
  @Input() pageSize = 25;
  @Input() offset = 0;
  @Input() query: VocabularyListQueryState = {
    searchTerm: '',
    sourceFilter: 'all',
    typeFilter: 'all'
  };

  @Output() selected = new EventEmitter<string>();
  @Output() deleted = new EventEmitter<string>();
  @Output() queryChanged = new EventEmitter<VocabularyListQueryState>();
  @Output() pageChanged = new EventEmitter<number>();

  searchTerm = '';
  sourceFilter: SourceFilter = 'all';
  typeFilter: TypeFilter = 'all';
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if ('query' in changes && this.query) {
      this.searchTerm = this.query.searchTerm;
      this.sourceFilter = this.query.sourceFilter;
      this.typeFilter = this.query.typeFilter;
    }
  }

  ngOnDestroy(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }

  get currentPage(): number {
    return this.pageSize > 0 ? Math.floor(this.offset / this.pageSize) + 1 : 1;
  }

  get totalPages(): number {
    if (this.totalCount <= 0 || this.pageSize <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.totalCount / this.pageSize));
  }

  get pageStartIndex(): number {
    if (this.totalCount === 0) {
      return 0;
    }
    return this.offset + 1;
  }

  get pageEndIndex(): number {
    return Math.min(this.offset + this.vocabularies.length, this.totalCount);
  }

  get canGoPrevious(): boolean {
    return this.offset > 0;
  }

  get canGoNext(): boolean {
    return this.offset + this.pageSize < this.totalCount;
  }

  open(id: string): void {
    this.selected.emit(id);
  }

  remove(id: string): void {
    this.deleted.emit(id);
  }

  setSourceFilter(filter: SourceFilter): void {
    if (this.sourceFilter === filter) {
      return;
    }
    this.sourceFilter = filter;
    this.emitQueryChanged();
  }

  setTypeFilter(filter: TypeFilter): void {
    if (this.typeFilter === filter) {
      return;
    }
    this.typeFilter = filter;
    this.emitQueryChanged();
  }

  onSearchTermChanged(value: string): void {
    this.searchTerm = value;
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.searchDebounceTimer = null;
      this.emitQueryChanged();
    }, 250);
  }

  previousPage(): void {
    if (!this.canGoPrevious) {
      return;
    }
    this.pageChanged.emit(Math.max(0, this.offset - this.pageSize));
  }

  nextPage(): void {
    if (!this.canGoNext) {
      return;
    }
    this.pageChanged.emit(this.offset + this.pageSize);
  }

  trackByVocabularyId(index: number, vocabulary: VocabularySummary): string {
    return vocabulary?.id || `vocabulary-${index}`;
  }

  private emitQueryChanged(): void {
    this.queryChanged.emit({
      searchTerm: this.searchTerm,
      sourceFilter: this.sourceFilter,
      typeFilter: this.typeFilter
    });
  }
}
