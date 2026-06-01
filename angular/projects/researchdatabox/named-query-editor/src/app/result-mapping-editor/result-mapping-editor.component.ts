import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';

interface MappingEntry {
  id: number;
  key: string;
  value: string;
}

@Component({
  selector: 'result-mapping-editor',
  templateUrl: './result-mapping-editor.component.html',
  standalone: false
})
export class ResultMappingEditorComponent implements OnChanges {
  @Input() resultObjectMapping: Record<string, string> = {};
  @Output() resultObjectMappingChange = new EventEmitter<Record<string, string>>();

  newKey = '';
  newValue = '';

  entries: MappingEntry[] = [];
  private nextEntryId = 1;
  private lastEmitted: Record<string, string> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if ('resultObjectMapping' in changes) {
      if (this.resultObjectMapping === this.lastEmitted) {
        return;
      }
      this.rebuildEntries();
    }
  }

  trackById(_index: number, entry: MappingEntry): number {
    return entry.id;
  }

  onKeyChange(entry: MappingEntry, newKey: string): void {
    if (entry.key === newKey) return;
    entry.key = newKey;
    this.emitFromEntries();
  }

  onValueChange(entry: MappingEntry, newValue: string): void {
    if (entry.value === newValue) return;
    entry.value = newValue;
    this.emitFromEntries();
  }

  addEntry(): void {
    if (!this.newKey) return;
    const updated = { ...this.resultObjectMapping };
    updated[this.newKey] = this.newValue;
    this.emit(updated);
    this.newKey = '';
    this.newValue = '';
  }

  removeEntry(entry: MappingEntry): void {
    this.entries = this.entries.filter(e => e.id !== entry.id);
    this.emitFromEntries();
  }

  private emitFromEntries(): void {
    const updated: Record<string, string> = {};
    for (const e of this.entries) {
      if (!e.key) continue;
      updated[e.key] = e.value;
    }
    this.lastEmitted = updated;
    this.resultObjectMapping = updated;
    this.resultObjectMappingChange.emit(updated);
  }

  private emit(value: Record<string, string>): void {
    this.lastEmitted = value;
    this.resultObjectMapping = value;
    this.rebuildEntries();
    this.resultObjectMappingChange.emit(value);
  }

  private rebuildEntries(): void {
    this.entries = Object.entries(this.resultObjectMapping || {}).map(([key, value]) => ({
      id: this.nextEntryId++,
      key,
      value
    }));
  }
}
