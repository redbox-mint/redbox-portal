import type { ContextSchemaField, EditorDiagnostic } from '@researchdatabox/sails-ng-common';
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';

interface NamedQueryParam {
  type: string;
  path: string;
  queryType?: string;
  whenUndefined: string;
  defaultValue?: unknown;
  format?: string;
  template?: string;
}

interface ParamEntry extends NamedQueryParam {
  id: number;
  key: string;
}

@Component({
  selector: 'query-param-editor',
  templateUrl: './query-param-editor.component.html',
  standalone: false,
})
export class QueryParamEditorComponent implements OnChanges {
  @Output() validityChange = new EventEmitter<boolean>();
  @Input() fields: ContextSchemaField[] = [];
  @Input() diagnostics: EditorDiagnostic[] = [];

  @Input() queryParams: Record<string, NamedQueryParam> = {};
  @Output() queryParamsChange = new EventEmitter<Record<string, NamedQueryParam>>();

  private invalidDefaults = new Set<number>();
  defaultValidity(id: number, valid: boolean): void {
    if (valid) this.invalidDefaults.delete(id);
    else this.invalidDefaults.add(id);
    this.validityChange.emit(this.invalidDefaults.size === 0);
  }

  expandedParam: string | null = null;
  addingNew = false;
  newParam: ParamEntry = this.emptyParam('');

  entries: ParamEntry[] = [];
  private nextEntryId = 1;
  private lastEmitted: Record<string, NamedQueryParam> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if ('queryParams' in changes) {
      if (this.queryParams === this.lastEmitted) {
        return;
      }
      this.rebuildEntries();
    }
  }

  trackById(_index: number, entry: ParamEntry): number {
    return entry.id;
  }

  toggleExpand(key: string): void {
    this.expandedParam = this.expandedParam === key ? null : key;
  }

  startAdd(): void {
    this.addingNew = true;
    this.newParam = this.emptyParam('');
  }

  cancelAdd(): void {
    this.addingNew = false;
    this.defaultValidity(0, true);
  }

  addParam(): void {
    if (!this.newParam.key || this.invalidDefaults.has(0)) return;
    // Keep existing control identities and their pending typed/default text intact.
    const key = this.newParam.key;
    const entry = { ...this.newParam, id: this.nextEntryId++ };
    const existing = this.entries.findIndex(param => param.key === key);
    if (existing >= 0) {
      this.defaultValidity(this.entries[existing].id, true);
      this.entries = this.entries.map((param, index) => (index === existing ? entry : param));
    } else this.entries = [...this.entries, entry];
    this.emitFromEntries();
    this.addingNew = false;
  }

  onFieldChange(entry: ParamEntry, field: keyof NamedQueryParam, value: unknown): void {
    (entry as unknown as Record<string, unknown>)[field as string] = value;
    if (field === 'type' || field === 'whenUndefined') this.defaultValidity(entry.id, true);
    this.emitFromEntries();
  }

  removeParam(entry: ParamEntry): void {
    this.entries = this.entries.filter(e => e.id !== entry.id);
    this.defaultValidity(entry.id, true);
    if (this.expandedParam === entry.key) {
      this.expandedParam = null;
    }
    this.emitFromEntries();
  }

  private emitFromEntries(): void {
    const updated: Record<string, NamedQueryParam> = {};
    for (const e of this.entries) {
      if (!e.key) continue;
      const { id: _id, key: _k, ...param } = e;
      updated[e.key] = param;
    }
    this.lastEmitted = updated;
    this.queryParams = updated;
    this.queryParamsChange.emit(updated);
  }

  private rebuildEntries(): void {
    this.entries = Object.entries(this.queryParams || {}).map(([key, val]) => ({
      ...val,
      id: this.nextEntryId++,
      key,
    }));
  }

  private emptyParam(key: string): ParamEntry {
    return {
      id: 0,
      key,
      type: 'string',
      path: '',
      whenUndefined: 'ignore',
      queryType: '',
      defaultValue: '',
      format: 'days',
      template: '',
    };
  }

  typeOptions = ['string', 'date', 'number', 'boolean', 'array', 'object'];
  queryTypeOptions = ['', 'contains', '<=', '>=', '<', '>', '=', '!=', '$in', '$nin', '$exists'];
  whenUndefinedOptions = ['ignore', 'defaultValue'];
  dateFormatOptions = ['days', 'ISODate'];
}
