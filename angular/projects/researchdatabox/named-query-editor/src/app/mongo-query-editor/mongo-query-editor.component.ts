import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';

interface QueryEntry {
  id: number;
  path: string;
  type: string;
  value: string;
}

@Component({
  selector: 'mongo-query-editor',
  templateUrl: './mongo-query-editor.component.html',
  standalone: false
})
export class MongoQueryEditorComponent implements OnChanges {
  @Input() mongoQuery: Record<string, unknown> = {};
  @Output() mongoQueryChange = new EventEmitter<Record<string, unknown>>();

  useRawJson = false;
  rawJsonText = '';
  jsonError: string | null = null;

  newPath = '';
  newType = 'string';
  newValue = '';

  entries: QueryEntry[] = [];
  private nextEntryId = 1;
  private lastEmitted: Record<string, unknown> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if ('mongoQuery' in changes) {
      if (this.mongoQuery === this.lastEmitted) {
        return;
      }
      this.rebuildEntries();
    }
  }

  trackById(_index: number, entry: QueryEntry): number {
    return entry.id;
  }

  toggleRawJson(): void {
    if (this.useRawJson) {
      this.useRawJson = false;
      this.jsonError = null;
    } else {
      this.rawJsonText = JSON.stringify(this.mongoQuery, null, 2);
      this.useRawJson = true;
      this.jsonError = null;
    }
  }

  applyRawJson(): void {
    try {
      const parsed = JSON.parse(this.rawJsonText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        this.jsonError = 'Must be a valid JSON object';
        return;
      }
      this.jsonError = null;
      this.emit(parsed as Record<string, unknown>);
      this.useRawJson = false;
    } catch (e: unknown) {
      this.jsonError = 'Invalid JSON: ' + ((e as Error).message || String(e));
    }
  }

  addEntry(): void {
    if (!this.newPath) return;
    const updated = { ...this.mongoQuery };
    updated[this.newPath] = this.parseValue(this.newType, this.newValue);
    this.emit(updated);
    this.newPath = '';
    this.newValue = '';
    this.newType = 'string';
  }

  onPathChange(entry: QueryEntry, newPath: string): void {
    if (entry.path === newPath) return;
    entry.path = newPath;
    this.emitFromEntries();
  }

  onTypeChange(entry: QueryEntry, newType: string): void {
    if (entry.type === newType) return;
    entry.type = newType;
    this.emitFromEntries();
  }

  onValueChange(entry: QueryEntry, newValue: string): void {
    if (entry.value === newValue) return;
    entry.value = newValue;
    this.emitFromEntries();
  }

  removeEntry(entry: QueryEntry): void {
    this.entries = this.entries.filter(e => e.id !== entry.id);
    this.emitFromEntries();
  }

  private emitFromEntries(): void {
    const updated: Record<string, unknown> = {};
    for (const e of this.entries) {
      if (!e.path) continue;
      updated[e.path] = this.parseValue(e.type, e.value);
    }
    this.lastEmitted = updated;
    this.mongoQuery = updated;
    this.mongoQueryChange.emit(updated);
  }

  private emit(value: Record<string, unknown>): void {
    this.lastEmitted = value;
    this.mongoQuery = value;
    this.rebuildEntries();
    this.mongoQueryChange.emit(value);
  }

  private rebuildEntries(): void {
    this.entries = Object.entries(this.mongoQuery || {}).map(([path, value]) => ({
      id: this.nextEntryId++,
      path,
      type: this.detectType(value),
      value: this.serializeValue(value)
    }));
  }

  private detectType(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    return 'object';
  }

  private serializeValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  }

  private parseValue(type: string, valueStr: string): unknown {
    switch (type) {
      case 'null': return null;
      case 'number': return Number(valueStr);
      case 'boolean': return valueStr === 'true';
      case 'array':
      case 'object':
        try {
          return JSON.parse(valueStr || (type === 'array' ? '[]' : '{}'));
        } catch {
          return type === 'array' ? [] : {};
        }
      default: return valueStr;
    }
  }

  typeOptions = ['string', 'number', 'boolean', 'null', 'object', 'array'];
}
