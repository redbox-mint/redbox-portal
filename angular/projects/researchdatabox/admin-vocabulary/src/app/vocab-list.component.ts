import { Component, EventEmitter, Input, Output } from '@angular/core';
import { VocabularySummary } from './vocabulary-api.service';

type SourceFilter = 'all' | 'local' | 'rva';
type TypeFilter = 'all' | 'flat' | 'tree';

@Component({
  selector: 'vocab-list',
  templateUrl: './vocab-list.component.html',
  styleUrls: ['./vocab-list.component.scss'],
  standalone: false
})
export class VocabListComponent {
  @Input() vocabularies: VocabularySummary[] = [];
  @Input() selectedId: string | null = null;

  @Output() selected = new EventEmitter<string>();
  @Output() deleted = new EventEmitter<string>();

  searchTerm = '';
  sourceFilter: SourceFilter = 'all';
  typeFilter: TypeFilter = 'all';

  get filteredVocabularies(): VocabularySummary[] {
    const query = this.searchTerm.trim().toLowerCase();
    return this.vocabularies.filter((vocabulary: VocabularySummary) => {
      const matchesQuery = !query || vocabulary.name.toLowerCase().includes(query) || vocabulary.slug?.toLowerCase().includes(query);
      const matchesSource = this.sourceFilter === 'all' || vocabulary.source === this.sourceFilter;
      const matchesType = this.typeFilter === 'all' || vocabulary.type === this.typeFilter;
      return matchesQuery && matchesSource && matchesType;
    });
  }

  open(id: string): void {
    this.selected.emit(id);
  }

  remove(id: string): void {
    this.deleted.emit(id);
  }

  setSourceFilter(filter: SourceFilter): void {
    this.sourceFilter = filter;
  }

  setTypeFilter(filter: TypeFilter): void {
    this.typeFilter = filter;
  }

  trackByVocabularyId(index: number, vocabulary: VocabularySummary): string {
    return vocabulary?.id || `vocabulary-${index}`;
  }
}
