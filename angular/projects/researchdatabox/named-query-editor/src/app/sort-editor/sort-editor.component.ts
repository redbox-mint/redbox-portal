import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';

interface SortEntry {
  id: number;
  field: string;
  direction: 'ASC' | 'DESC';
}

@Component({
  selector: 'sort-editor',
  templateUrl: './sort-editor.component.html',
  standalone: false
})
export class SortEditorComponent implements OnChanges {
  @Input() sort: Array<Record<string, 'ASC' | 'DESC'>> | undefined = [];
  @Output() sortChange = new EventEmitter<Array<Record<string, 'ASC' | 'DESC'>> | undefined>();

  newField = '';
  newDirection: 'ASC' | 'DESC' = 'ASC';

  entries: SortEntry[] = [];
  private nextEntryId = 1;
  private lastEmitted: Array<Record<string, 'ASC' | 'DESC'>> | undefined | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if ('sort' in changes) {
      if (this.sort === this.lastEmitted) {
        return;
      }
      this.rebuildEntries();
    }
  }

  trackById(_index: number, entry: SortEntry): number {
    return entry.id;
  }

  onFieldChange(entry: SortEntry, newField: string): void {
    if (entry.field === newField) return;
    entry.field = newField;
    this.emitFromEntries();
  }

  onDirectionChange(entry: SortEntry, newDirection: 'ASC' | 'DESC'): void {
    if (entry.direction === newDirection) return;
    entry.direction = newDirection;
    this.emitFromEntries();
  }

  addEntry(): void {
    if (!this.newField) return;
    this.entries = [...this.entries, {
      id: this.nextEntryId++,
      field: this.newField,
      direction: this.newDirection
    }];
    this.emitFromEntries();
    this.newField = '';
  }

  removeEntry(entry: SortEntry): void {
    this.entries = this.entries.filter(e => e.id !== entry.id);
    this.emitFromEntries();
  }

  private emitFromEntries(): void {
    const list = this.entries
      .filter(e => e.field)
      .map(e => ({ [e.field]: e.direction } as Record<string, 'ASC' | 'DESC'>));
    const value = list.length > 0 ? list : undefined;
    this.lastEmitted = value;
    this.sort = value;
    this.sortChange.emit(value);
  }

  private rebuildEntries(): void {
    const list = this.sort || [];
    this.entries = list.map(item => {
      const key = Object.keys(item)[0] || '';
      return {
        id: this.nextEntryId++,
        field: key,
        direction: item[key]
      };
    });
  }
}
