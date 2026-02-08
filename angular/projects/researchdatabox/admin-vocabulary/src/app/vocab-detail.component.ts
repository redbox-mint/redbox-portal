import { Component, Input } from '@angular/core';
import { VocabularyDetail, VocabularyEntry } from './vocabulary-api.service';

@Component({
  selector: 'vocab-detail',
  templateUrl: './vocab-detail.component.html',
  styleUrls: ['./vocab-detail.component.scss'],
  standalone: false
})
export class VocabDetailComponent {
  @Input() draft: VocabularyDetail = {
    name: '',
    type: 'flat',
    source: 'local',
    entries: []
  };

  @Input() selectedVocabularyId: string | null = null;

  get hasEntries(): boolean {
    return !!this.draft.entries && this.draft.entries.length > 0;
  }

  addEntry(): void {
    if (!this.draft.entries) {
      this.draft.entries = [];
    }
    this.draft.entries.push({
      label: '',
      value: '',
      order: this.draft.entries.length
    });
  }

  removeEntry(index: number): void {
    if (!this.draft.entries) {
      return;
    }
    this.draft.entries.splice(index, 1);
    this.reindexEntries();
  }

  moveEntryUp(index: number): void {
    if (!this.draft.entries || index <= 0) {
      return;
    }
    const list = this.draft.entries;
    [list[index - 1], list[index]] = [list[index], list[index - 1]];
    this.reindexEntries();
  }

  moveEntryDown(index: number): void {
    if (!this.draft.entries || index >= this.draft.entries.length - 1) {
      return;
    }
    const list = this.draft.entries;
    [list[index], list[index + 1]] = [list[index + 1], list[index]];
    this.reindexEntries();
  }

  trackByEntryIndex(index: number): number {
    return index;
  }

  private reindexEntries(): void {
    if (!this.draft.entries) {
      return;
    }
    this.draft.entries = this.draft.entries.map((entry: VocabularyEntry, idx: number) => ({ ...entry, order: idx }));
  }
}
