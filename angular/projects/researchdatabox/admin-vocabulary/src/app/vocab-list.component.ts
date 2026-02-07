import { Component, EventEmitter, Input, Output } from '@angular/core';
import { VocabularySummary } from './vocabulary-api.service';

@Component({
  selector: 'vocab-list',
  templateUrl: './vocab-list.component.html',
  standalone: false
})
export class VocabListComponent {
  @Input() vocabularies: VocabularySummary[] = [];
  @Input() selectedId: string | null = null;

  @Output() selected = new EventEmitter<string>();
  @Output() deleted = new EventEmitter<string>();

  open(id: string): void {
    this.selected.emit(id);
  }

  remove(id: string): void {
    this.deleted.emit(id);
  }
}
