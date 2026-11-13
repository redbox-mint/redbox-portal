import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CodeEditorComponent,
  buildFieldTree,
  type FieldNode,
  TranslationService,
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
      <span>{{ d.reason | i18next }}</span>
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
  imports: [CodeEditorComponent, ReportDiagnosticsComponent, I18NextPipe],
  template: ` <h3 class="report-template-heading">
      <label [for]="inputId">{{ label }}</label>
    </h3>
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
      <div class="report-template-fields">
        @if (reportKey) {
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            data-template-report-url
            (click)="editor.insertAtCursor(reportUrlTemplate)"
          >
            {{ 'report-ux-report-address' | i18next }}
          </button>
        }
        @for (field of insertableFields; track field.path) {
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            [attr.data-template-field]="field.path"
            (click)="editor.insertAtCursor(fieldInsertion(field))"
          >
            {{ field.title }}
          </button>
        }
      </div>
    </details>`,
  styleUrls: ['./report-assistance.component.scss'],
})
export class ReportTemplateInputComponent implements OnChanges {
  @Input() fields: ContextSchemaField[] = [];
  @Input() property = '';
  @Input() reportKey = '';
  @Input() multivalue = false;
  @Input() kind: 'display' | 'csv' = 'display';
  @Input() value = '';
  @Input() label = '';
  @Input() inputId = '';
  @Input() diagnostics: EditorDiagnostic[] = [];
  @Input() location = '';
  @Output() valueChange = new EventEmitter<string>();
  constructor(private i18n: TranslationService) {}
  fieldInsertion = fieldInsertion;
  insertableFields: FieldNode[] = [];
  source: CompletionSource = { fields: [], roots: [], helpers: Object.keys(handlebarsInstance().helpers) };
  warningLines: number[] = [];
  errorLines: number[] = [];
  get reportUrlTemplate(): string {
    return '{{optTemplateData.brandingAndPortalUrl}}/admin/report/' + encodeURIComponent(this.reportKey);
  }
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
    const friendlyFields = this.source.fields.map(field => ({
      ...field,
      title:
        field.path === 'recordTableMeta.val'
          ? String(this.i18n.t('report-ux-current-item'))
          : field.path === 'optTemplateData.brandingAndPortalUrl'
            ? String(this.i18n.t('report-ux-web-address'))
            : field.path === 'oid'
              ? String(this.i18n.t('data-grids-oid'))
              : field.title ||
                field.path
                  .split('.')
                  .pop()!
                  .replace(/([a-z])([A-Z])/g, '$1 $2')
                  .replace(/[_-]+/g, ' '),
    }));
    const flatten = (nodes: FieldNode[]): FieldNode[] => nodes.flatMap(node => [node, ...flatten(node.children)]);
    this.insertableFields = flatten(buildFieldTree(friendlyFields, []))
      .filter(field =>
        field.path === 'recordTableMeta.val'
          ? this.multivalue || this.kind === 'csv'
          : field.path === 'optTemplateData.brandingAndPortalUrl' || this.fields.some(row => row.path === field.path)
      )
      .filter(field => field.type !== 'undefined' && (field.isArray || !['object', 'array'].includes(field.type)))
      .sort(
        (a, b) => Number(b.path.startsWith('recordTableMeta.val')) - Number(a.path.startsWith('recordTableMeta.val'))
      );
    const matching = this.diagnostics.filter(d => d.field === this.location && d.line > 0);
    this.warningLines = matching.filter(d => d.severity !== 'error').map(d => d.line);
    this.errorLines = matching.filter(d => d.severity === 'error').map(d => d.line);
  }
}
