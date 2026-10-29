import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CodeEditorComponent,
  FieldTreeComponent,
  I18NextPipe,
  fieldInsertion,
  type CompletionSource,
} from '@researchdatabox/portal-ng-common';
import {
  type ContextSchemaField,
  type EditorDiagnostic,
  handlebarsInstance,
  reportCsvTemplateFields,
  reportDisplayTemplateFields,
} from '@researchdatabox/sails-ng-common';

@Component({
  selector: 'report-diagnostics',
  standalone: true,
  imports: [CommonModule, I18NextPipe],
  template: `@for (d of matching; track $index) {
    <div
      class="rb-ws-diagnostic report-diagnostic"
      [class.rb-ws-diagnostic-warning]="d.severity !== 'error'"
      [class.report-diagnostic-error]="d.severity === 'error'"
      [attr.data-location]="d.field"
      role="status"
    >
      <i
        class="fa-solid"
        [class.fa-circle-xmark]="d.severity === 'error'"
        [class.fa-triangle-exclamation]="d.severity !== 'error'"
        aria-hidden="true"
      ></i>
      <strong class="rb-ws-diagnostic-label">{{
        (d.severity === 'error' ? 'report-blocking' : 'report-advisory') | i18next
      }}</strong>
      <span>{{ d.reason }}</span>
      @if (d.line) {
        <span>({{ d.line }}:{{ d.column }})</span>
      }
      @if (d.suggestion) {
        <span
          >{{ 'report-suggestion' | i18next }} <code>{{ d.suggestion }}</code></span
        >
      }
    </div>
  }`,
  styles: [':host { display: block; }'],
})
export class ReportDiagnosticsComponent {
  @Input() diagnostics: EditorDiagnostic[] = [];
  @Input() location = '';
  @Input() descendants = false;
  get matching(): EditorDiagnostic[] {
    return this.diagnostics.filter(
      d => d.field === this.location || (this.descendants && d.field.startsWith(this.location + '.'))
    );
  }
}

/** Report contexts are composed by the same shared adapters as the description route. */
@Component({
  selector: 'report-template-input',
  standalone: true,
  imports: [CodeEditorComponent, FieldTreeComponent, ReportDiagnosticsComponent, I18NextPipe],
  template: ` <label class="form-label" [for]="inputId">{{ label }}</label>
    <rb-template-editor
      #editor
      [inputId]="inputId"
      [rows]="4"
      [value]="value"
      [describedBy]="inputId + '-help'"
      [completions]="source"
      (valueChange)="valueChange.emit($event)"
      [warningLines]="warningLines"
      [highlightLines]="errorLines"
    ></rb-template-editor>
    <p class="form-text" [id]="inputId + '-help'">
      {{ (kind === 'display' ? 'report-display-context-help' : 'report-csv-context-help') | i18next }}
    </p>
    <report-diagnostics [diagnostics]="diagnostics" [location]="location"></report-diagnostics>
    <details class="rb-ws-disclosure">
      <summary>{{ 'report-insert-template-field' | i18next }}</summary>
      <rb-field-tree
        [fields]="source.fields"
        [roots]="source.roots"
        [initialExpanded]="source.roots"
        [insertion]="insertion"
        (insert)="editor.insertAtCursor($event)"
      ></rb-field-tree>
    </details>`,
  styles: [':host { display: block; } .form-text { margin: 6px 0 0; font-size: 12px; }'],
})
export class ReportTemplateInputComponent implements OnChanges {
  @Input() fields: ContextSchemaField[] = [];
  @Input() property = '';
  @Input() multivalue = false;
  @Input() kind: 'display' | 'csv' = 'display';
  @Input() value = '';
  @Input() label = '';
  @Input() inputId = '';
  @Input() diagnostics: EditorDiagnostic[] = [];
  @Input() location = '';
  @Output() valueChange = new EventEmitter<string>();
  insertion = fieldInsertion;
  source: CompletionSource = { fields: [], roots: [], helpers: Object.keys(handlebarsInstance().helpers) };
  warningLines: number[] = [];
  errorLines: number[] = [];
  ngOnChanges(): void {
    this.source = {
      ...this.source,
      roots: ['metadata', 'recordTableMeta', 'optTemplateData'],
      fields: (this.kind === 'display' ? reportDisplayTemplateFields : reportCsvTemplateFields)(
        this.fields,
        this.property,
        this.multivalue
      ),
    };
    const matching = this.diagnostics.filter(d => d.field === this.location && d.line > 0);
    this.warningLines = matching.filter(d => d.severity !== 'error').map(d => d.line);
    this.errorLines = matching.filter(d => d.severity === 'error').map(d => d.line);
  }
}
