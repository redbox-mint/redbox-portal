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
  standalone: false
})
export class QueryParamEditorComponent implements OnChanges {
  @Input() queryParams: Record<string, NamedQueryParam> = {};
  @Output() queryParamsChange = new EventEmitter<Record<string, NamedQueryParam>>();

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
  }

  addParam(): void {
    if (!this.newParam.key) return;
    const updated = { ...this.queryParams };
    const key = this.newParam.key;
    const { id: _id, key: _k, ...param } = this.newParam;
    updated[key] = param;
    this.emit(updated);
    this.addingNew = false;
  }

  onFieldChange(entry: ParamEntry, field: keyof NamedQueryParam, value: unknown): void {
    (entry as unknown as Record<string, unknown>)[field as string] = value;
    this.emitFromEntries();
  }

  removeParam(entry: ParamEntry): void {
    this.entries = this.entries.filter(e => e.id !== entry.id);
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

  private emit(value: Record<string, NamedQueryParam>): void {
    this.lastEmitted = value;
    this.queryParams = value;
    this.rebuildEntries();
    this.queryParamsChange.emit(value);
  }

  private rebuildEntries(): void {
    this.entries = Object.entries(this.queryParams || {}).map(([key, val]) => ({
      id: this.nextEntryId++,
      key,
      type: val.type,
      path: val.path,
      queryType: val.queryType,
      whenUndefined: val.whenUndefined,
      defaultValue: val.defaultValue,
      format: val.format,
      template: val.template
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
      template: ''
    };
  }

  typeOptions = ['string', 'date', 'number', 'boolean', 'array', 'object'];
  queryTypeOptions = ['', 'contains', '<=', '>=', '<', '>', '=', '!=', '$in', '$nin', '$exists'];
  whenUndefinedOptions = ['ignore', 'defaultValue'];
  dateFormatOptions = ['days', 'ISODate'];
}
