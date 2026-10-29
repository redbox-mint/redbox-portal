import { Component, EventEmitter, Input, NgModule, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AutocompleteComponent,
  CodeEditorComponent,
  FieldTreeComponent,
  I18NextPipe,
  type CompletionSource,
  type FieldNode,
  fieldInsertion,
} from '@researchdatabox/portal-ng-common';
import { ContextSchemaField, EditorDiagnostic, lookupPath, storedRecordPath } from '@researchdatabox/sails-ng-common';

@Component({
  selector: 'nq-diagnostics',
  standalone: false,
  template: `<div
    *ngFor="let d of matching"
    class="nq-diagnostic"
    [class.text-danger]="d.severity !== 'warning'"
    [class.text-warning]="d.severity === 'warning'"
    [attr.data-location]="d.field"
    role="status"
  >
    <strong>{{ (d.severity === 'warning' ? 'named-query-advisory' : 'named-query-blocking') | i18next }}</strong>
    {{ d.reason }}
    <span *ngIf="d.suggestion">
      {{ 'named-query-suggestion' | i18next }} <code>{{ d.suggestion }}</code></span
    >
  </div>`,
})
export class QueryDiagnosticsComponent {
  @Input() diagnostics: EditorDiagnostic[] = [];
  @Input() location = '';
  get matching(): EditorDiagnostic[] {
    return this.diagnostics.filter(
      d => !this.location || d.field === this.location || d.field.startsWith(this.location + '.')
    );
  }
}

@Component({
  selector: 'nq-path-input',
  standalone: false,
  template: `<input
      #control
      type="text"
      class="form-control form-control-sm"
      [attr.aria-label]="label"
      [ngModel]="value"
      (ngModelChange)="valueChange.emit($event)"
      [attr.data-nq-path]="kind"
    />
    <rb-field-autocomplete [target]="control" mode="path" [source]="source"></rb-field-autocomplete>
    <details *ngIf="fields.length">
      <summary>{{ 'named-query-choose-field' | i18next }}</summary>
      <rb-field-tree [fields]="fields" [insertion]="insertion" (insert)="valueChange.emit($event)"></rb-field-tree>
    </details>
    <small class="form-text text-muted" *ngIf="selected as f"
      >{{ f.type }} <span *ngIf="f.enum"> · {{ 'named-query-enum' | i18next }} {{ f.enum | json }}</span>
      <span *ngIf="f.isArray"> · {{ 'named-query-array-help' | i18next }}</span>
      <span *ngIf="!f.isArray"> · {{ 'named-query-operators' | i18next }} {{ operators(f) }}</span>
    </small>`,
})
export class QueryPathInputComponent implements OnChanges {
  @Input() value = '';
  @Input() label = '';
  @Input() fields: ContextSchemaField[] = [];
  @Input() kind: 'stored' | 'mapping' = 'stored';
  @Output() valueChange = new EventEmitter<string>();
  source: CompletionSource = { fields: [], roots: [], helpers: [] };
  insertion = (node: FieldNode): string | null =>
    this.kind === 'mapping' ? lookupPath(node.path) : storedRecordPath(node.path);
  ngOnChanges(): void {
    this.source = {
      fields:
        this.kind === 'stored'
          ? this.fields.flatMap(f => {
              const path = storedRecordPath(f.path);
              return path ? [{ ...f, path }] : [];
            })
          : this.fields.filter(f => lookupPath(f.path) !== null),
      pathInsertion: this.kind === 'mapping' ? lookupPath : undefined,
      roots: [],
      helpers: [],
    };
  }
  get selected(): ContextSchemaField | undefined {
    return this.fields.find(
      f => (this.kind === 'mapping' ? lookupPath(f.path) : storedRecordPath(f.path)) === this.value
    );
  }
  operators(f: ContextSchemaField): string {
    return f.type === 'string'
      ? '$eq, $ne, $in, $regex'
      : ['number', 'integer'].includes(f.type)
        ? '$eq, $ne, $gt, $gte, $lt, $lte'
        : '$eq, $ne, $exists';
  }
}

/** Convert only explicit user edits; loading a typed control never rewrites legacy values. */
@Component({
  selector: 'nq-typed-value',
  standalone: false,
  template: `<input
      *ngIf="inputType !== 'boolean' && inputType !== 'object' && inputType !== 'array'"
      class="form-control form-control-sm"
      [attr.aria-label]="label"
      [type]="inputType === 'number' ? 'number' : 'text'"
      [ngModel]="value"
      (ngModelChange)="change($event)"
    />
    <select
      *ngIf="inputType === 'boolean'"
      class="form-control form-control-sm"
      [attr.aria-label]="label"
      [ngModel]="value"
      (ngModelChange)="change($event)"
    >
      <option [ngValue]="undefined">—</option>
      <option [ngValue]="true">true</option>
      <option [ngValue]="false">false</option>
    </select>
    <textarea
      *ngIf="inputType === 'object' || inputType === 'array'"
      class="form-control form-control-sm"
      [attr.aria-label]="label"
      [ngModel]="jsonValue"
      (ngModelChange)="changeJson($event)"
    ></textarea>
    <small *ngIf="template" class="form-text text-muted">{{ 'named-query-template-value-help' | i18next }}</small>
    <small *ngIf="type === 'date'" class="form-text text-muted">{{
      (format === 'days' ? 'named-query-date-days-help' : 'named-query-date-iso-help') | i18next
    }}</small>
    <small *ngIf="error" class="text-danger" role="alert">{{ 'named-query-invalid-json' | i18next }}</small>
    <button type="button" class="btn btn-sm btn-outline-secondary nq-unset-value mt-1"
      [attr.aria-label]="(unsetLabel | i18next) + ': ' + label" (click)="unset()">
      {{ unsetLabel | i18next }}
    </button>`,
})
export class QueryTypedValueComponent implements OnChanges {
  @Input() value: unknown;
  @Input() type = 'string';
  @Input() format?: string;
  @Input() queryType?: string;
  @Input() template?: string;
  @Input() label = '';
  @Input() unsetLabel = 'named-query-unset-value';
  @Output() valueChange = new EventEmitter<unknown>();
  @Output() validityChange = new EventEmitter<boolean>();
  jsonValue = '';
  error = false;
  get inputType(): string {
    // NamedQueryService applies the template before coercing its result. Keep
    // template input untouched and let the server evaluate the full context.
    if (this.template) return 'string';
    if (this.type === 'date') return this.format === 'days' && this.queryType ? 'number' : 'string';
    return this.type;
  }
  ngOnChanges(changes?: SimpleChanges): void {
    if (changes && !['value', 'type', 'template'].some(key => key in changes)) return;
    const wasInvalid = this.error;
    this.error = false;
    this.jsonValue =
      this.value === undefined ? '' : typeof this.value === 'string' ? this.value : JSON.stringify(this.value);
    if (wasInvalid) this.validityChange.emit(true);
  }
  change(value: unknown): void {
    this.valueChange.emit(value === null ? undefined : value);
  }
  unset(): void {
    this.jsonValue = '';
    this.error = false;
    this.validityChange.emit(true);
    this.valueChange.emit(undefined);
  }
  changeJson(text: string): void {
    this.jsonValue = text;
    try {
      const value: unknown = text === '' ? undefined : JSON.parse(text);
      if (
        value !== undefined &&
        (this.type === 'array' ? !Array.isArray(value) : !value || typeof value !== 'object' || Array.isArray(value))
      )
        throw new Error();
      this.error = false;
      this.validityChange.emit(true);
      this.valueChange.emit(value);
    } catch {
      this.error = true;
      this.validityChange.emit(false);
    }
  }
}

@Component({
  selector: 'nq-mapping-value',
  standalone: false,
  template: `<div class="d-flex mb-1">
      <button type="button" class="btn btn-sm btn-outline-secondary" (click)="template = !template">
        {{ (template ? 'named-query-use-direct' : 'named-query-use-template') | i18next }}
      </button>
    </div>
    <nq-path-input
      *ngIf="!template"
      [value]="value"
      [label]="label"
      kind="mapping"
      [fields]="fields"
      (valueChange)="valueChange.emit($event)"
    ></nq-path-input>
    <ng-container *ngIf="template"
      ><label [for]="inputId">{{ label }}</label>
      <rb-template-editor
        #editor
        [inputId]="inputId"
        [value]="value"
        [rows]="3"
        [completions]="source"
        (valueChange)="valueChange.emit($event)"
      ></rb-template-editor>
      <details *ngIf="fields.length">
        <summary>{{ 'named-query-choose-field' | i18next }}</summary>
        <rb-field-tree
          [fields]="fields"
          [insertion]="templateInsertion"
          (insert)="editor.insertAtCursor($event)"
        ></rb-field-tree>
      </details>
    </ng-container>`,
})
export class QueryMappingValueComponent implements OnChanges {
  private static nextId = 1;
  readonly inputId = `nq-mapping-template-${QueryMappingValueComponent.nextId++}`;
  @Input() value = '';
  @Input() label = '';
  @Input() fields: ContextSchemaField[] = [];
  @Output() valueChange = new EventEmitter<string>();
  template = false;
  source: CompletionSource = { fields: [], roots: ['record'], helpers: ['if', 'unless', 'each', 'with', 'lookup'] };
  templateInsertion = fieldInsertion;
  ngOnChanges(): void {
    if (this.value.includes('{{')) this.template = true;
    this.source = { ...this.source, fields: this.fields };
  }
}

@NgModule({
  declarations: [
    QueryDiagnosticsComponent,
    QueryPathInputComponent,
    QueryTypedValueComponent,
    QueryMappingValueComponent,
  ],
  imports: [CommonModule, FormsModule, I18NextPipe, FieldTreeComponent, AutocompleteComponent, CodeEditorComponent],
  exports: [QueryDiagnosticsComponent, QueryPathInputComponent, QueryTypedValueComponent, QueryMappingValueComponent],
})
export class QueryAssistanceModule {}
