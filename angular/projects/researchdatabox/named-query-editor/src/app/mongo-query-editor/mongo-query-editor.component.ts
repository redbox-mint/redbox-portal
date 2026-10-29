import type { ContextSchemaField, EditorDiagnostic } from '@researchdatabox/sails-ng-common';
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
  standalone: false,
})
export class MongoQueryEditorComponent implements OnChanges {
  @Output() validityChange = new EventEmitter<boolean>();
  @Input() fields: ContextSchemaField[] = [];
  @Input() diagnostics: EditorDiagnostic[] = [];

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
      this.applyRawJson();
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
        this.jsonError = 'named-query-invalid-json';
        this.validityChange.emit(false);
        return;
      }
      this.jsonError = null;
      this.validityChange.emit(true);
      this.emit(parsed as Record<string, unknown>);
      this.useRawJson = false;
    } catch (e: unknown) {
      this.jsonError = 'named-query-invalid-json';
      this.validityChange.emit(false);
    }
  }

  addEntry(): void {
    if (!this.newPath) return;
    try {
      this.parseValue(this.newType, this.newValue);
    } catch {
      this.jsonError = 'named-query-invalid-json';
      this.validityChange.emit(false);
      return;
    }
    // Entries include pending edits that are absent from the last valid query.
    const existing = this.entries.find(entry => entry.path === this.newPath);
    if (existing) {
      existing.type = this.newType;
      existing.value = this.newValue;
    } else {
      this.entries = [...this.entries, {
        id: this.nextEntryId++, path: this.newPath, type: this.newType, value: this.newValue,
      }];
    }
    this.emitFromEntries();
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
    try {
      for (const e of this.entries) {
        if (e.path) updated[e.path] = this.parseValue(e.type, e.value);
      }
      this.jsonError = null;
      this.validityChange.emit(true);
    } catch {
      this.jsonError = 'named-query-invalid-json';
      this.validityChange.emit(false);
      return;
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
      value: this.serializeValue(value),
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

  rawChanged(): void {
    this.validityChange.emit(false);
  }

  private parseValue(type: string, valueStr: string): unknown {
    switch (type) {
      case 'null':
        return null;
      case 'number':
        return Number(valueStr);
      case 'boolean':
        return valueStr === 'true';
      case 'array':
      case 'object':
        try {
          return JSON.parse(valueStr || (type === 'array' ? '[]' : '{}'));
        } catch {
          throw new Error('named-query-invalid-json');
        }
      default:
        return valueStr;
    }
  }

  typeOptions = ['string', 'number', 'boolean', 'null', 'object', 'array'];
}
