import { diagnosticExpressionAt } from './diagnostic-expression';
import { blockHelperScaffold, helperInsertion, helperUsage } from './helper-usage';
import {
  Component,
  AfterViewInit,
  ElementRef,
  EventEmitter,
  HostListener,
  Inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import type { EmailSchemaTarget, EmailContextSchemaResponse } from '@researchdatabox/sails-ng-common';
import { defaultSchemaSelection, SchemaSelection } from './schema-selection';
import { validateContextJson, ContextPathError } from './context-validation';
import { parseEmailContextJson } from './relaxed-context-json';
import { ContextSchemaField, flattenContextFields } from './schema-fields';
import { generateSampleContext, SampleContextError } from './context-sample';
import { SourceEdit, pathAt, suggestionEdit } from './diagnostic-fix';
import type { CompletionSource } from './template-completion';
import { AutocompleteComponent } from './autocomplete.component';
import { FieldTreeComponent } from './field-tree.component';
import { SchemaTargetComponent } from './schema-target.component';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { I18NextPipe, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { CodeEditorComponent } from './code-editor.component';
import { DialogComponent } from './dialog.component';
import { EmailTemplateAdminService } from './email-template-admin.service';
import {
  EmailAdminContent,
  EmailAdminDiagnostic,
  EmailAdminDraft,
  EmailAdminEditorState,
  EmailAdminHistory,
  EmailAdminPreview,
  EmailPreviewRecord,
  EmailTemplateApiError,
  EmailTemplateFormat,
  PublishSummary,
  RAW_INTERPOLATION,
  changedLineCount,
  copyContent,
  identifierAt,
  isApiError,
  sameContent,
  utf8Bytes,
} from './email-templates.model';
import { HistoryPanelComponent } from './history-panel.component';
import { PreviewFrameComponent, PreviewMode } from './preview-frame.component';
import { RecordPickerComponent } from './record-picker.component';
import { WhenPipe } from './when.pipe';

export const VALIDATE_DEBOUNCE_MS = 400;
const SYNTAX_HELPERS: string[] = ['each', 'if', 'unless', 'with'];

/** A run of message text; code runs are local names or Handlebars tokens shown as code. */
export interface MessageSegment {
  text: string;
  code: boolean;
}

export const PREVIEW_DEBOUNCE_MS = 600;
export const AUTOSAVE_DEBOUNCE_MS = 1500;

export type EditorTab = 'edit' | 'history';
export type EditorDialog =
  | 'publish'
  | 'reset'
  | 'discard'
  | 'change-record'
  | 'from-default'
  | 'restore'
  | 'view'
  | 'conflict'
  | 'sample';

interface Message {
  key: string;
  params?: Record<string, unknown>;
}

/** A "did you mean" replacement, split so the suggested name can be styled as code. */
export interface DiagnosticFix {
  edit: SourceEdit;
  name: string;
  before: string;
  after: string;
}

/** Context JSON schema differences shown before "Show all". */
export const CONTEXT_ERRORS_SHOWN = 5;

@Component({
  selector: 'email-templates-editor',
  standalone: true,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    I18NextPipe,
    WhenPipe,
    CodeEditorComponent,
    DialogComponent,
    HistoryPanelComponent,
    PreviewFrameComponent,
    RecordPickerComponent,
    SchemaTargetComponent,
    FieldTreeComponent,
    AutocompleteComponent,
  ],
  templateUrl: './editor.component.html',
  styleUrls: ['./email-templates.shared.scss', './editor.component.scss'],
})
export class EditorComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input({ required: true }) templateId = '';
  @Input() brandName = '';
  /** Record picked in an earlier editor, so moving between templates keeps the preview data. */
  @Input() initialRecord: EmailPreviewRecord | null = null;
  @Output() back = new EventEmitter<void>();
  @Output() recordChange = new EventEmitter<EmailPreviewRecord | null>();

  @ViewChild('editorHeading') private editorHeading?: ElementRef<HTMLHeadingElement>;
  @ViewChild('bodyEditor') private bodyEditor?: CodeEditorComponent;
  @ViewChild('subjectInput') private subjectInput?: ElementRef<HTMLInputElement>;

  readonly raw = RAW_INTERPOLATION;
  // Server state
  state: EmailAdminEditorState | null = null;
  loading = true;
  loadError: string | null = null;

  // Working copy
  content: EmailAdminContent = { subject: '', body: '', format: 'html' };
  /** What the working copy is compared against: the saved draft, or the live/default content it was opened from. */
  baseline: EmailAdminContent = { subject: '', body: '', format: 'html' };
  draftRevision: number | null = null;
  lastSavedAt: string | null = null;
  diagnostics: EmailAdminDiagnostic[] = [];
  validating = false;
  saving = false;
  saveFailed = false;
  errorMessage: Message | null = null;
  infoMessage: Message | null = null;
  /** Spoken by the polite live region. */
  announcement = '';

  // Conflict handling: the user's content is held here, never discarded.
  conflictError: EmailTemplateApiError | null = null;
  conflictContent: EmailAdminContent | null = null;
  rescuedContent: EmailAdminContent | null = null;

  // Preview
  record: EmailPreviewRecord | null = null;
  recordContextText: string | null = null;
  contextText = '';
  contextProblem: 'json' | 'size' | null = null;
  loadingContext = false;
  contextLoadError: string | null = null;
  preview: EmailAdminPreview | null = null;
  previewDiagnostics: EmailAdminDiagnostic[] = [];
  previewErrorCode: string | null = null;
  previewing = false;
  previewMode: PreviewMode = 'rendered';
  previewSource: 'working' | 'default' = 'working';

  // History
  tab: EditorTab = 'edit';
  history: EmailAdminHistory[] = [];
  historyLoading = false;
  historyFailed = false;
  private historyLoaded = false;

  // Dialogs
  dialog: EditorDialog | null = null;
  publishSummary: PublishSummary | null = null;
  pendingRecord: EmailPreviewRecord | null = null;
  pendingRestore: EmailAdminHistory | null = null;
  viewing: EmailAdminHistory | null = null;
  busy: string | null = null;

  private validateTimer: ReturnType<typeof setTimeout> | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private validateSeq = 0;
  private previewSeq = 0;
  private contextSeq = 0;
  private savePromise: Promise<void> | null = null;
  private saveAgain = false;
  private destroyed = false;
  private loadSeq = 0;
  private schemaSeq = 0;
  private contextEditSeq = 0;
  private leavePromise: Promise<boolean> | null = null;

  schemaTargets: EmailSchemaTarget[] = [];
  schemaSelection: SchemaSelection | null = null;
  contextSchema: EmailContextSchemaResponse | null = null;
  schemaLoading = false;
  schemaError = false;
  contextErrors: ContextPathError[] = [];
  contextConverted = false;
  showAllContextErrors = false;
  /** Schema the pending "Generate sample data" confirmation was asked against. */
  private sampleSchema: EmailContextSchemaResponse | null = null;
  /** The source the current diagnostics describe; fixes apply only while it is unchanged. */
  private diagnosticSource: EmailAdminContent | null = null;
  private fieldsMemo: { schema: EmailContextSchemaResponse | null; fields: ContextSchemaField[] } | null = null;
  private completionMemo: { fields: ContextSchemaField[]; help: unknown; source: CompletionSource } | null = null;

  constructor(
    private api: EmailTemplateAdminService,
    @Inject(TranslationService) private i18n: TranslationService,
    @Inject(LoggerService) private logger: LoggerService
  ) {}

  ngAfterViewInit(): void {
    this.editorHeading?.nativeElement.focus();
  }

  ngOnInit(): void {
    void this.init();
  }

  ngOnDestroy(): void {
    if (this.state)
      this.api.previewWorkspaces.set(this.templateId, {
        record: this.record ? { ...this.record } : null,
        recordContextText: this.recordContextText,
        contextText: this.contextText,
        contextConverted: this.contextConverted,
      });
    // Navigation normally settles first. Retain a rescue copy for unexpected teardown.
    if (this.dirty && this.state)
      this.api.heldEdits.set(this.templateId, {
        content: copyContent(this.content),
        conflict: this.conflictError,
      });
    this.destroyed = true;
    ++this.loadSeq;
    ++this.validateSeq;
    ++this.previewSeq;
    ++this.contextSeq;
    ++this.schemaSeq;
    this.clearTimers();
  }

  /** All hash/history/in-app transitions use this same boundary before destroying this keyed editor. */
  prepareToLeave(): Promise<boolean> {
    if (this.leavePromise) return this.leavePromise;
    if (this.busy) return Promise.resolve(false);
    if (this.conflictContent) {
      this.api.heldEdits.set(this.templateId, { content: copyContent(this.content), conflict: this.conflictError });
      return Promise.resolve(true);
    }
    this.busy = 'leave';
    this.leavePromise = this.settleSave().finally(() => {
      this.busy = null;
      this.leavePromise = null;
    });
    return this.leavePromise;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty || this.saving) {
      event.preventDefault();
    }
  }

  // ---- Derived state -------------------------------------------------------

  get integrationContext(): boolean {
    return this.state?.contextKind === 'integration';
  }

  get dirty(): boolean {
    return !sameContent(this.content, this.baseline);
  }

  get hasDraft(): boolean {
    return this.draftRevision !== null;
  }

  get liveVersion(): number | null {
    return this.state?.live?.token.revision ?? null;
  }

  get basedOnVersion(): number | null {
    return this.state?.draft ? (this.state.draft.baseVersion?.revision ?? null) : this.liveVersion;
  }

  get incompleteTransition(): number | null {
    return this.state?.consistency.find(item => item.code === 'INCOMPLETE_LIVE_TRANSITION')?.version ?? null;
  }

  get retainedDraftVersion(): number | null {
    return this.state?.consistency.find(item => item.code === 'PUBLISHED_DRAFT_RETAINED')?.version ?? null;
  }

  get subjectDiagnostics(): EmailAdminDiagnostic[] {
    return this.diagnostics.filter(item => item.field === 'subject');
  }

  get subjectInvalid(): boolean {
    return this.subjectDiagnostics.some(item => item.severity !== 'warning');
  }

  get bodyDiagnostics(): EmailAdminDiagnostic[] {
    return this.diagnostics.filter(item => item.field !== 'subject');
  }

  get bodyErrorLines(): number[] {
    return [...new Set(this.bodyDiagnostics.filter(item => item.severity !== 'warning').map(item => item.line))];
  }

  get bodyWarningLines(): number[] {
    return [...new Set(this.bodyDiagnostics.filter(item => item.severity === 'warning').map(item => item.line))];
  }

  get errorCount(): number {
    return this.diagnostics.filter(item => item.severity !== 'warning').length;
  }

  get warningCount(): number {
    return this.diagnostics.filter(item => item.severity === 'warning').length;
  }

  /** Flattened schema fields for the field tree and suggestions, cached per schema response. */
  get schemaFields(): ContextSchemaField[] {
    if (this.fieldsMemo?.schema !== this.contextSchema) {
      this.fieldsMemo = {
        schema: this.contextSchema,
        fields: this.contextSchema ? flattenContextFields(this.contextSchema.schema) : [],
      };
    }
    return this.fieldsMemo.fields;
  }

  /** Stable between schema/help changes so the autocomplete inputs don't churn. */
  get completionSource(): CompletionSource | null {
    const help = this.state?.help;
    if (!help) return null;
    const fields = this.schemaFields;
    if (this.completionMemo?.fields !== fields || this.completionMemo.help !== help) {
      this.completionMemo = { fields, help, source: { fields, roots: help.contextRoots, helpers: help.helpers } };
    }
    return this.completionMemo.source;
  }

  /** Record type label for the schema in use, for messages about it. */
  get contextSchemaLabel(): string {
    if (this.integrationContext) return this.i18n.t('email-templates-schema-precision-integration');
    const id = this.contextSchema?.recordType ?? this.schemaSelection?.recordType ?? '';
    return this.schemaTargets.find(target => target.id === id)?.label ?? id;
  }

  get visibleContextErrors(): ContextPathError[] {
    return this.showAllContextErrors ? this.contextErrors : this.contextErrors.slice(0, CONTEXT_ERRORS_SHOWN);
  }

  get contextEdited(): boolean {
    return this.recordContextText !== null
      ? this.contextText !== this.recordContextText
      : this.contextText.trim() !== '';
  }

  get validatePending(): boolean {
    return this.validating || this.validateTimer !== null;
  }

  /** Translation key explaining why Publish is unavailable, or null when it is. */
  get publishBlocker(): string | null {
    if (!this.state) {
      return 'email-templates-publish-blocked-loading';
    }
    if (this.incompleteTransition !== null) {
      return 'email-templates-publish-blocked-incomplete';
    }
    if (this.conflictContent) {
      return 'email-templates-publish-blocked-conflict';
    }
    if (this.diagnostics.some(item => item.severity !== 'warning')) {
      return 'email-templates-publish-blocked-diagnostics';
    }
    if (!this.hasDraft && !this.dirty) {
      return 'email-templates-publish-blocked-no-draft';
    }
    if (this.saveFailed) {
      return 'email-templates-publish-blocked-save-failed';
    }
    return null;
  }

  get publishDisabled(): boolean {
    return this.publishBlocker !== null || this.validatePending || this.busy !== null;
  }

  // ---- Loading -------------------------------------------------------------

  private async init(): Promise<void> {
    await this.load();
    if (this.destroyed) return;
    const held = this.api.heldEdits.get(this.templateId);
    if (held && this.state) {
      this.content = copyContent(held.content);
      this.rescuedContent = copyContent(held.content);
      if (held.conflict) this.openConflict(held.conflict);
      this.scheduleValidate(0);
    }
    if (this.integrationContext) void this.loadIntegrationSchema();
    else void this.loadSchemaTargets();
    const workspace = this.api.previewWorkspaces.get(this.templateId);
    if (this.state && workspace && (!this.integrationContext || !workspace.record)) {
      this.record = workspace.record ? { ...workspace.record } : null;
      this.recordContextText = workspace.recordContextText;
      this.contextText = workspace.contextText;
      this.contextConverted = workspace.contextConverted;
      this.recordChange.emit(this.record);
      this.schedulePreview(0);
    } else if (this.state && this.initialRecord && !this.integrationContext) {
      void this.loadRecord(this.initialRecord);
    }
  }

  async load(): Promise<boolean> {
    const seq = ++this.loadSeq;
    this.loading = true;
    this.loadError = null;
    try {
      const state = await this.api.editorState(this.templateId);
      if (!this.destroyed && seq === this.loadSeq) {
        this.applyState(state);
        return true;
      }
    } catch (error) {
      if (!this.destroyed && seq === this.loadSeq) this.loadError = this.errorKey(error);
      this.logger.error('Email template editor failed to load');
    } finally {
      if (!this.destroyed && seq === this.loadSeq) this.loading = false;
    }
    return false;
  }

  /** Replace server state wholesale and reset the working copy from it. */
  private applyState(state: EmailAdminEditorState): void {
    if (this.destroyed) return;
    this.clearTimer('save');
    this.state = state;
    const source = state.draft ?? state.live ?? state.suppliedDefault;
    this.content = copyContent(source);
    this.baseline = copyContent(source);
    this.draftRevision = state.draft?.draftRevision ?? null;
    this.lastSavedAt = state.draft?.updatedAt ?? null;
    this.saveFailed = false;
    this.diagnostics = [];
    this.diagnosticSource = null;
    this.previewSource = 'working';
    this.historyLoaded = false;
    this.scheduleValidate(0);
    this.schedulePreview(0);
    if (this.tab === 'history') {
      void this.loadHistory();
    }
  }

  /** Adopt a draft returned by a draft mutation (from-default, restore). */
  private applyDraft(draft: EmailAdminDraft, diagnostics: EmailAdminDiagnostic[]): void {
    if (this.destroyed) return;
    if (this.state) {
      this.state = { ...this.state, draft };
    }
    this.content = copyContent(draft);
    this.baseline = copyContent(draft);
    this.draftRevision = draft.draftRevision;
    this.lastSavedAt = draft.updatedAt;
    this.diagnostics = diagnostics;
    this.diagnosticSource = copyContent(draft);
    this.saveFailed = false;
    this.previewSource = 'working';
    this.scheduleValidate(0);
    this.schedulePreview(0);
  }

  // ---- Editing -------------------------------------------------------------

  onSubjectChange(value: string): void {
    if (this.busy || this.destroyed) return;
    this.content = { ...this.content, subject: value };
    this.onContentChange();
  }

  onBodyChange(value: string): void {
    if (this.busy || this.destroyed) return;
    this.content = { ...this.content, body: value };
    this.onContentChange();
  }

  onFormatChange(format: EmailTemplateFormat): void {
    if (this.busy || this.destroyed) return;
    if (format === this.content.format) {
      return;
    }
    this.content = { ...this.content, format };
    this.onContentChange();
  }

  private onContentChange(): void {
    this.infoMessage = null;
    this.previewDiagnostics = [];
    this.previewErrorCode = null;
    this.previewSource = 'working';
    this.scheduleValidate(VALIDATE_DEBOUNCE_MS);
    this.schedulePreview(PREVIEW_DEBOUNCE_MS);
    if (!this.conflictContent) {
      this.scheduleSave(AUTOSAVE_DEBOUNCE_MS);
    }
  }

  insertToken(text: string): void {
    if (this.busy) return;
    this.bodyEditor?.insertAtCursor(text);
  }

  helperToken(helper: string): string {
    return helperInsertion(helper);
  }

  /** Block helpers insert a balanced scaffold and select its first placeholder for typing over. */
  insertHelper(helper: string): void {
    if (this.busy) return;
    const text = helperInsertion(helper);
    const placeholder = blockHelperScaffold(helper) ? /YOUR_[A-Z]+/.exec(text) : null;
    this.bodyEditor?.insertAtCursor(
      text,
      placeholder ? { start: placeholder.index, end: placeholder.index + placeholder[0].length } : undefined
    );
  }

  get blockHelpers(): string[] {
    return (this.state?.help.helpers ?? []).filter(helper => blockHelperScaffold(helper) !== null);
  }

  get inlineHelpers(): string[] {
    return (this.state?.help.helpers ?? []).filter(helper => blockHelperScaffold(helper) === null);
  }

  /** The inline helper whose usage is shown under the chips: hovered or focused, else none. */
  activeHelper: string | null = null;

  readonly helperUsage = helperUsage;

  /** Source text is resolved locally for part B's recovery messages. */
  diagnosticExpression(diagnostic: EmailAdminDiagnostic): string | null {
    const content = this.previewSource === 'default' && this.state ? this.state.suppliedDefault : this.content;
    if (diagnostic.field === 'context') return null;
    return diagnosticExpressionAt(content[diagnostic.field], diagnostic.line, diagnostic.column);
  }

  readonly importsMirror = { alias: 'imports.record', record: 'record' };

  formatLabel(format: EmailTemplateFormat): string {
    return format === 'text' ? 'email-templates-format-text' : 'email-templates-format-html';
  }

  formatBytes(bytes: number): string {
    if (bytes >= 1048576 && bytes % 1048576 === 0) {
      return `${bytes / 1048576} MB`;
    }
    if (bytes >= 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${bytes} B`;
  }

  eventLabel(entry: EmailAdminHistory): string {
    if (entry.event === 'reset') {
      return this.i18n.t('email-templates-event-reset');
    }
    if (entry.event === 'restore-published') {
      return this.i18n.t('email-templates-event-restore-published', { version: entry.restoredFromVersion });
    }
    return this.i18n.t('email-templates-event-publish');
  }

  revealDiagnostic(diagnostic: EmailAdminDiagnostic): void {
    if (diagnostic.field === 'subject') {
      const input = this.subjectInput?.nativeElement;
      input?.focus();
      input?.setSelectionRange(diagnostic.column - 1, diagnostic.column - 1);
    } else {
      this.bodyEditor?.focusPosition(diagnostic.line, diagnostic.column);
    }
  }

  /** Preview diagnostics point into the editor only while it shows the working copy. */
  get previewDiagnosticsNavigable(): boolean {
    return this.previewSource === 'working';
  }

  /** Human message for a diagnostic, naming the identifier from local source when possible. */
  diagnosticMessage(diagnostic: EmailAdminDiagnostic): string {
    const { key, params } = this.diagnosticText(diagnostic);
    return params ? this.i18n.t(key, { ...params, interpolation: RAW_INTERPOLATION }) : this.i18n.t(key);
  }

  /** The same message split so local names and Handlebars tokens can be shown as code. */
  diagnosticSegments(diagnostic: EmailAdminDiagnostic): MessageSegment[] {
    const { key, params } = this.diagnosticText(diagnostic);
    return this.segments(key, params);
  }

  /** Translate `key`, returning its `params` as separate code runs rather than interpolated text. */
  segments(key: string, params?: Record<string, string>): MessageSegment[] {
    if (!params) return [{ text: this.i18n.t(key), code: false }];
    const markers = Object.fromEntries(Object.keys(params).map(name => [name, `\u0001${name}\u0002`]));
    const text = String(this.i18n.t(key, { ...markers, interpolation: RAW_INTERPOLATION }));
    return text
      .split(/\u0001(\w+)\u0002/)
      .map((part, index) => (index % 2 ? { text: params[part] ?? '', code: true } : { text: part, code: false }))
      .filter(segment => segment.text);
  }

  private diagnosticText(diagnostic: EmailAdminDiagnostic): { key: string; params?: Record<string, string> } {
    const source = diagnostic.field === 'subject' ? this.content.subject : this.content.body;
    const name = identifierAt(source, diagnostic.line, diagnostic.column);
    const reason = diagnostic.reason || diagnostic.code;
    if (diagnostic.severity === 'warning') {
      if (diagnostic.code === 'SCHEMA_LINT_TRUNCATED') return { key: 'email-templates-warning-SCHEMA_LINT_TRUNCATED' };
      const path = pathAt(source, diagnostic.line, diagnostic.column);
      const warnings = [
        'UNKNOWN_FIELD',
        'EACH_NOT_ARRAY',
        'PRINTS_OBJECT',
        'OPTIONAL_UNGUARDED',
        'SCHEMA_LINT_TRUNCATED',
      ];
      if (!warnings.includes(diagnostic.code)) return { key: 'email-templates-warning-other' };
      return path
        ? { key: `email-templates-warning-${diagnostic.code}-named`, params: { name: path } }
        : { key: `email-templates-warning-${diagnostic.code}` };
    }
    if (reason === 'UNCLOSED_BLOCK' || reason === 'MISMATCHED_CLOSE') {
      // Only the server's fixed allow-list names a helper; anything else gets the generic wording.
      const helper = diagnostic.helper && SYNTAX_HELPERS.includes(diagnostic.helper) ? diagnostic.helper : null;
      return helper
        ? {
            key: `email-templates-diagnostic-${reason}-helper`,
            params: { open: `{{#${helper}}}`, close: `{{/${helper}}}` },
          }
        : { key: `email-templates-diagnostic-${reason}` };
    }
    if (reason === 'UNEXPECTED_TOKEN') return { key: 'email-templates-diagnostic-UNEXPECTED_TOKEN' };
    if (reason === 'RENDER_FAILED') {
      const expression = this.diagnosticExpression(diagnostic);
      return expression
        ? { key: 'email-templates-diagnostic-RENDER_FAILED-named', params: { name: expression } }
        : { key: 'email-templates-diagnostic-RENDER_FAILED' };
    }
    const known = [
      'UNKNOWN_CONTEXT_ROOT',
      'UNKNOWN_HELPER',
      'UNSUPPORTED_CONSTRUCT',
      'INVALID_SYNTAX',
      'TOO_COMPLEX',
      'EMPTY_CONTENT',
      'LENGTH_LIMIT',
    ];
    if (!known.includes(reason)) {
      return { key: 'email-templates-diagnostic-other' };
    }
    if ((reason === 'UNKNOWN_CONTEXT_ROOT' || reason === 'UNKNOWN_HELPER') && name) {
      return { key: `email-templates-diagnostic-${reason}-named`, params: { name } };
    }
    return { key: `email-templates-diagnostic-${reason}` };
  }

  isWarning(diagnostic: EmailAdminDiagnostic): boolean {
    return diagnostic.severity === 'warning';
  }

  /**
   * A one-click "did you mean" replacement, only while the source still matches
   * what was validated, so the diagnostic's position is exact.
   */
  diagnosticFix(diagnostic: EmailAdminDiagnostic): DiagnosticFix | null {
    if (!diagnostic.suggestion || diagnostic.field === 'context' || !this.diagnosticSource) return null;
    const field = diagnostic.field;
    const source = this.content[field];
    if (this.diagnosticSource[field] !== source) return null;
    const edit = suggestionEdit(source, diagnostic, diagnostic.suggestion, this.contextSchema?.schema);
    if (!edit) return null;
    const marker = '\u0000';
    const [before, after = ''] = String(
      this.i18n.t('email-templates-did-you-mean', { name: marker, interpolation: RAW_INTERPOLATION })
    ).split(marker);
    return { edit, name: diagnostic.suggestion, before, after };
  }

  /** Replace just that occurrence; the normal edit path then revalidates and autosaves. */
  applySuggestion(diagnostic: EmailAdminDiagnostic): void {
    if (this.busy || this.destroyed) return;
    const fix = this.diagnosticFix(diagnostic);
    if (!fix) return;
    const { start, end, text } = fix.edit;
    if (diagnostic.field === 'subject') {
      const input = this.subjectInput?.nativeElement;
      if (!input || input.readOnly) return;
      input.focus();
      input.setRangeText(text, start, end, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      this.bodyEditor?.replaceRange(start, end, text);
    }
    this.announce('email-templates-suggestion-applied', { name: text, interpolation: RAW_INTERPOLATION });
  }

  contextErrorMessage(error: ContextPathError): string {
    const known = [
      'required',
      'type',
      'enum',
      'const',
      'minLength',
      'maxLength',
      'minimum',
      'maximum',
      'minItems',
      'maxItems',
      'additionalProperties',
      'readOnly',
      'anyOf',
      'oneOf',
      'limit',
    ];
    if (!known.includes(error.code)) return this.i18n.t('email-templates-context-error-other');
    return this.i18n.t(`email-templates-context-error-${error.code}`, {
      expected: (error.expected ?? []).join(' | '),
      interpolation: RAW_INTERPOLATION,
    });
  }

  diagnosticPosition(diagnostic: EmailAdminDiagnostic): string {
    return this.i18n.t('email-templates-diagnostic-position', { line: diagnostic.line, column: diagnostic.column });
  }

  // ---- Validation ----------------------------------------------------------

  private scheduleValidate(delay: number): void {
    if (this.destroyed) return;
    this.clearTimer('validate');
    // An older response must not validate a newer working copy during debounce.
    ++this.validateSeq;
    this.validateTimer = setTimeout(() => {
      this.validateTimer = null;
      void this.validate();
    }, delay);
  }

  private localLimitDiagnostics(content: EmailAdminContent): EmailAdminDiagnostic[] {
    const help = this.state?.help;
    if (!help) {
      return [];
    }
    const out: EmailAdminDiagnostic[] = [];
    if (utf8Bytes(content.subject) > help.maxSubjectBytes) {
      out.push({ code: 'LENGTH_LIMIT', field: 'subject', reason: 'LENGTH_LIMIT', line: 1, column: 1 });
    }
    if (utf8Bytes(content.body) > help.maxBodyBytes) {
      out.push({ code: 'LENGTH_LIMIT', field: 'body', reason: 'LENGTH_LIMIT', line: 1, column: 1 });
    }
    return out;
  }

  async validate(): Promise<void> {
    const seq = ++this.validateSeq;
    const content = copyContent(this.content);
    const limits = this.localLimitDiagnostics(content);
    if (limits.length) {
      this.validating = false;
      this.diagnostics = limits;
      this.diagnosticSource = content;
      return;
    }
    this.validating = true;
    try {
      const diagnostics = await this.api.validate(this.templateId, content, this.schemaSelection);
      if (seq === this.validateSeq) {
        this.diagnostics = diagnostics;
        this.diagnosticSource = content;
      }
    } catch (error) {
      if (seq === this.validateSeq) {
        this.diagnostics =
          isApiError(error) && error.code === 'LENGTH_LIMIT'
            ? [{ code: 'LENGTH_LIMIT', field: 'body', reason: 'LENGTH_LIMIT', line: 1, column: 1 }]
            : this.diagnostics;
        if (!(isApiError(error) && error.code === 'LENGTH_LIMIT')) {
          this.showError(error);
        }
      }
    } finally {
      if (seq === this.validateSeq) {
        this.validating = false;
      }
    }
  }

  // ---- Saving --------------------------------------------------------------

  private scheduleSave(delay: number): void {
    this.clearTimer('save');
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, delay);
  }

  /** Manual "Save draft". Creates a draft even when nothing has changed yet. */
  async saveNow(): Promise<void> {
    this.clearTimer('save');
    if (this.hasDraft && !this.dirty && !this.saving) {
      this.announce('email-templates-draft-up-to-date');
      return;
    }
    await this.save(true);
  }

  /**
   * Persist the working copy. Saves are serialised: an edit made while a save
   * is in flight queues exactly one follow-up save with the new revision.
   */
  save(force = false): Promise<void> {
    if (this.savePromise) {
      this.saveAgain = true;
      return this.savePromise;
    }
    if (this.conflictContent || !this.state || (!force && !this.dirty)) {
      return Promise.resolve();
    }
    this.savePromise = this.runSave(force).finally(() => {
      this.savePromise = null;
      if (this.saveAgain && !this.destroyed) {
        this.saveAgain = false;
        if (this.dirty && !this.conflictContent) {
          void this.save();
        }
      }
    });
    return this.savePromise;
  }

  private async runSave(manual: boolean): Promise<void> {
    const sent = copyContent(this.content);
    this.saving = true;
    try {
      const response = await this.api.saveDraft(this.templateId, sent, this.draftRevision);
      // Saving an untouched default makes it an override, including its subject semantics.
      if (this.integrationContext && !this.state?.live && !this.state?.draft && this.previewSource === 'working')
        this.schedulePreview(0);
      if (this.state) {
        this.state = { ...this.state, draft: response.draft };
      }
      this.api.heldEdits.delete(this.templateId);
      this.draftRevision = response.draft.draftRevision;
      this.baseline = sent;
      this.lastSavedAt = response.draft.updatedAt;
      this.saveFailed = false;
      if (sameContent(sent, this.content) && !this.validatePending) {
        this.diagnostics = [...response.diagnostics, ...this.diagnostics.filter(item => item.severity === 'warning')];
        this.diagnosticSource = sent;
      }
      if (manual) {
        this.announce('email-templates-draft-saved');
      }
    } catch (error) {
      if (isApiError(error) && error.isConflict) {
        this.openConflict(error);
      } else {
        this.saveFailed = true;
        this.showError(error);
      }
    } finally {
      this.saving = false;
    }
  }

  /** Make sure the working copy is persisted (or the save has definitely failed). */
  private async settleSave(): Promise<boolean> {
    this.clearTimer('save');
    if (this.savePromise) {
      await this.savePromise;
    }
    while (this.dirty && !this.conflictContent && !this.destroyed) {
      await this.save();
      if (this.saveFailed) break;
    }
    return !this.conflictContent && !this.saveFailed && !this.dirty;
  }

  /** Wait for in-flight saves and drop queued ones, before replacing the draft. */
  private async abandonPendingSave(): Promise<void> {
    this.clearTimer('save');
    this.saveAgain = false;
    if (this.savePromise) {
      await this.savePromise;
    }
  }

  // ---- Conflict ------------------------------------------------------------

  private openConflict(error: EmailTemplateApiError): void {
    this.clearTimer('save');
    this.conflictError = error;
    this.conflictContent = this.conflictContent ?? copyContent(this.content);
    this.dialog = 'conflict';
    this.busy = null;
  }

  /** Who changed what, phrased from the content-free 409 payload. */
  get conflictMessage(): Message {
    const current = this.conflictError?.current;
    if (!current) {
      return { key: 'email-templates-conflict-generic' };
    }
    const mineLive = this.state?.live?.token ?? null;
    const theirLive = current.live?.token ?? null;
    const liveChanged = mineLive?.id !== theirLive?.id || mineLive?.revision !== theirLive?.revision;
    const who = current.lastChange?.updatedByName || this.i18n.t('email-templates-someone');
    if (liveChanged && theirLive) {
      return {
        key: 'email-templates-conflict-published',
        params: {
          name: current.live?.updatedByName || who,
          version: theirLive.revision,
          interpolation: RAW_INTERPOLATION,
        },
      };
    }
    if (liveChanged) {
      return {
        key: 'email-templates-conflict-reset',
        params: { name: who, version: current.latestVersion, interpolation: RAW_INTERPOLATION },
      };
    }
    if (current.draft && current.draft.draftRevision !== this.draftRevision) {
      return {
        key: 'email-templates-conflict-draft-saved',
        params: { name: current.draft.updatedByName || who, interpolation: RAW_INTERPOLATION },
      };
    }
    if (!current.draft && this.draftRevision !== null) {
      return { key: 'email-templates-conflict-draft-gone', params: { name: who, interpolation: RAW_INTERPOLATION } };
    }
    return { key: 'email-templates-conflict-generic' };
  }

  async reloadAfterConflict(): Promise<void> {
    if (this.busy || this.destroyed) return;
    this.busy = 'reload';
    this.clearTimer('save');
    try {
      // Keep the rejected snapshot protected until the new working copy is adopted.
      if (await this.load()) {
        this.api.heldEdits.delete(this.templateId);
        this.rescuedContent = this.conflictContent;
        this.conflictContent = null;
        this.conflictError = null;
        this.dialog = null;
        this.errorMessage = null;
      } else if (!this.destroyed && this.loadError) {
        this.errorMessage = { key: this.loadError };
      }
    } finally {
      this.busy = null;
    }
  }

  async copyText(text: string): Promise<void> {
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // Clipboard API needs a secure context; fall back to a temporary selection.
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.className = 'visually-hidden';
      document.body.appendChild(area);
      area.select();
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      area.remove();
    }
    this.announce(copied ? 'email-templates-copied' : 'email-templates-copy-failed');
  }

  dismissRescued(): void {
    this.rescuedContent = null;
  }

  // ---- Preview -------------------------------------------------------------

  private schedulePreview(delay: number): void {
    if (this.destroyed) return;
    this.clearTimer('preview');
    ++this.previewSeq;
    this.previewing = !!this.contextText.trim();
    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      void this.runPreview();
    }, delay);
  }

  onContextChange(value: string): void {
    if (this.busy) return;
    ++this.contextEditSeq;
    this.contextConverted = false;
    this.contextText = value;
    this.previewDiagnostics = [];
    this.previewErrorCode = null;
    this.schedulePreview(PREVIEW_DEBOUNCE_MS);
  }

  async runPreview(): Promise<void> {
    const seq = ++this.previewSeq;
    const contextText = this.contextText;
    this.contextProblem = null;
    this.contextErrors = [];
    this.previewDiagnostics = [];
    this.previewErrorCode = null;
    this.previewing = false;
    if (!this.state || !contextText.trim()) {
      this.preview = null;
      this.previewDiagnostics = [];
      this.previewErrorCode = null;
      return;
    }
    if (utf8Bytes(contextText) > this.state.help.maxContextBytes) {
      this.contextProblem = 'size';
      this.preview = null;
      return;
    }
    let strictContext: string;
    try {
      const parsed = parseEmailContextJson(contextText, this.state.help.maxContextBytes);
      strictContext = JSON.stringify(parsed);
      if (utf8Bytes(strictContext) > this.state.help.maxContextBytes) {
        this.contextProblem = 'size';
        this.preview = null;
        return;
      }
      this.contextErrors = this.contextSchema ? validateContextJson(parsed, this.contextSchema.schema) : [];
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.contextProblem = 'json';
        this.preview = null;
        return;
      }
    } catch {
      this.contextProblem = 'json';
      this.preview = null;
      return;
    }
    const content =
      this.previewSource === 'default' ? copyContent(this.state.suppliedDefault) : copyContent(this.content);
    this.previewing = true;
    try {
      const source =
        this.previewSource === 'default' ||
        (!this.state.live && !this.state.draft && sameContent(content, this.state.suppliedDefault))
          ? 'default'
          : 'override';
      const preview = this.integrationContext
        ? await this.api.preview(this.templateId, content, strictContext, source)
        : await this.api.preview(this.templateId, content, strictContext);
      if (seq === this.previewSeq) {
        this.preview = preview;
        this.previewDiagnostics = [];
        this.previewErrorCode = null;
        if (!preview.html && this.previewMode === 'text' && content.format === 'text') {
          this.previewMode = 'rendered';
        }
      }
    } catch (error) {
      if (seq === this.previewSeq) {
        this.preview = null;
        this.previewDiagnostics = isApiError(error) ? error.diagnostics : [];
        this.previewErrorCode = isApiError(error) ? error.code : 'UNAVAILABLE';
      }
    } finally {
      if (seq === this.previewSeq) {
        this.previewing = false;
      }
    }
  }

  /** The preview failed for the current source, even though validation may have passed. */
  get previewFailing(): boolean {
    return !this.preview && this.previewErrorCode !== null;
  }

  get previewErrorKey(): string {
    const code = this.previewErrorCode ?? 'UNAVAILABLE';
    if (code === 'RENDER_FAILED') {
      return 'email-templates-preview-render-failed';
    }
    if (code === 'INVALID_CONTEXT') {
      return 'email-templates-preview-invalid-context';
    }
    if (this.previewDiagnostics.length) {
      return 'email-templates-preview-template-invalid';
    }
    return this.errorKey(new EmailTemplateApiError(0, code));
  }

  get sanitiserRemovals(): string[] {
    return (this.preview?.sanitiserRemovals ?? []).map(item =>
      item.attribute
        ? this.i18n.t('email-templates-removed-attribute', {
            name: item.attribute ?? '',
            interpolation: RAW_INTERPOLATION,
          })
        : `<${item.element ?? 'markup'}>`
    );
  }

  setPreviewMode(mode: PreviewMode): void {
    this.previewMode = mode;
    if (mode === 'rendered' && this.preview?.html !== undefined) this.schedulePreview(0);
  }

  previewNewDefault(): void {
    this.previewSource = 'default';
    this.tab = 'edit';
    this.schedulePreview(0);
  }

  previewWorkingCopy(): void {
    this.previewSource = 'working';
    this.schedulePreview(0);
  }

  // ---- Record and context --------------------------------------------------

  requestRecord(record: EmailPreviewRecord): void {
    if (this.contextEdited) {
      this.pendingRecord = record;
      this.dialog = 'change-record';
      return;
    }
    void this.loadRecord(record);
  }

  confirmRecordChange(): void {
    const record = this.pendingRecord;
    this.closeDialog();
    if (record) {
      void this.loadRecord(record);
    }
  }

  async loadRecord(record: EmailPreviewRecord): Promise<void> {
    const seq = ++this.contextSeq;
    const editSeq = this.contextEditSeq;
    this.clearTimer('preview');
    ++this.previewSeq;
    this.preview = null;
    this.previewDiagnostics = [];
    this.previewErrorCode = null;
    this.record = null;
    this.recordContextText = null;
    this.contextText = '';
    this.recordChange.emit(null);
    this.loadingContext = true;
    this.contextLoadError = null;
    try {
      const context = await this.api.recordContext(record.oid, this.templateId);
      if (this.destroyed || seq !== this.contextSeq) return;
      if (editSeq !== this.contextEditSeq) return; // Typed JSON wins over an in-flight record fetch.
      this.record = record;
      this.recordChange.emit(record);
      const text = JSON.stringify(context, null, 2);
      this.recordContextText = text;
      this.contextText = text;
      this.contextConverted = false;
      const selection = defaultSchemaSelection(
        this.schemaTargets,
        context,
        this.api.schemaSelections.get(this.templateId)
      );
      if (selection) void this.selectSchemaTarget(selection, false);
      this.schedulePreview(0);
    } catch (error) {
      if (!this.destroyed && seq === this.contextSeq)
        this.contextLoadError =
          isApiError(error) && error.code === 'FORBIDDEN' ? 'email-templates-record-unavailable' : this.errorKey(error);
    } finally {
      if (!this.destroyed && seq === this.contextSeq) this.loadingContext = false;
    }
  }

  /** Normalize on blur without disrupting typing/caret. Preview always sends strict JSON. */
  normaliseContext(): void {
    if (!this.contextText.trim() || this.busy) return;
    try {
      const normal = JSON.stringify(parseEmailContextJson(this.contextText, this.state?.help.maxContextBytes), null, 2);
      if (utf8Bytes(normal) > (this.state?.help.maxContextBytes ?? 262144)) return;
      if (normal !== this.contextText) {
        const uneditedRecord = !this.contextEdited;
        this.contextText = normal;
        if (uneditedRecord) this.recordContextText = normal;
        this.contextConverted = true;
      }
    } catch {
      /* runPreview owns parse/size feedback. */
    }
  }

  private async loadIntegrationSchema(): Promise<void> {
    const seq = ++this.schemaSeq;
    const editSeq = this.contextEditSeq;
    this.schemaLoading = true;
    this.schemaError = false;
    try {
      const schema = await this.api.contextSchema(undefined, undefined, this.templateId);
      if (this.destroyed || seq !== this.schemaSeq) return;
      this.contextSchema = schema;
      if (!this.contextText.trim() && editSeq === this.contextEditSeq) this.applySample(schema);
      this.scheduleValidate(0);
      this.schedulePreview(0);
    } catch {
      if (!this.destroyed && seq === this.schemaSeq) this.schemaError = true;
    } finally {
      if (!this.destroyed && seq === this.schemaSeq) this.schemaLoading = false;
    }
  }

  async loadSchemaTargets(): Promise<void> {
    try {
      const response = await this.api.schemaTargets();
      if (this.destroyed) return;
      this.schemaTargets = response.recordTypes;
      let context: Record<string, unknown> | null = null;
      try {
        context = this.contextText ? parseEmailContextJson(this.contextText) : null;
      } catch {
        /* No usable record yet. */
      }
      const selection = defaultSchemaSelection(
        this.schemaTargets,
        context,
        this.api.schemaSelections.get(this.templateId)
      );
      if (selection) await this.selectSchemaTarget(selection, false);
    } catch {
      if (!this.destroyed) this.schemaError = true;
    }
  }

  /** UI selector calls this; persistence is explicit so inferred defaults can follow the record. */
  async selectSchemaTarget(selection: SchemaSelection, persist = true): Promise<void> {
    const seq = ++this.schemaSeq;
    this.schemaSelection = selection;
    if (persist) this.api.schemaSelections.set(this.templateId, selection);
    this.schemaLoading = true;
    this.schemaError = false;
    this.contextSchema = null;
    ++this.validateSeq;
    this.validating = false;
    this.diagnostics = this.diagnostics.filter(item => item.severity !== 'warning');
    try {
      const response = await this.api.contextSchema(selection.recordType, selection.stage, this.templateId);
      if (this.destroyed || seq !== this.schemaSeq) return;
      this.contextSchema = response;
      this.scheduleValidate(0);
      this.schedulePreview(0);
    } catch {
      if (!this.destroyed && seq === this.schemaSeq) this.schemaError = true;
    } finally {
      if (!this.destroyed && seq === this.schemaSeq) this.schemaLoading = false;
    }
  }

  /** Selector controls; explicit choices are remembered for this template. */
  chooseSchemaTarget(selection: SchemaSelection): void {
    if (this.busy || this.destroyed) return;
    void this.selectSchemaTarget(selection);
  }

  requestSample(): void {
    if (this.busy || !this.contextSchema) return;
    if (this.contextEdited) {
      this.sampleSchema = this.contextSchema;
      this.dialog = 'sample';
      return;
    }
    this.applySample(this.contextSchema);
  }

  confirmSample(): void {
    const schema = this.sampleSchema;
    this.closeDialog();
    // The schema may have changed while the dialog was open; never apply a stale sample.
    if (schema && schema === this.contextSchema) this.applySample(schema);
  }

  private applySample(schema: EmailContextSchemaResponse): void {
    if (this.busy || this.destroyed) return;
    let sample: Record<string, unknown>;
    try {
      sample = generateSampleContext(schema.schema);
    } catch (error) {
      if (!(error instanceof SampleContextError)) throw error;
      this.errorMessage = { key: 'email-templates-sample-failed' };
      return;
    }
    const text = JSON.stringify(sample, null, 2);
    this.onContextChange(text);
    if (this.integrationContext) {
      this.record = null;
      this.recordContextText = text;
    }
    this.announce('email-templates-sample-applied');
  }

  resetContext(): void {
    if (this.recordContextText !== null) {
      ++this.contextEditSeq;
      this.contextText = this.recordContextText;
      this.schedulePreview(0);
    }
  }

  // ---- Tabs ----------------------------------------------------------------

  selectTab(tab: EditorTab, focus = false): void {
    this.tab = tab;
    if (tab === 'history' && !this.historyLoaded) {
      void this.loadHistory();
    }
    if (focus) {
      setTimeout(() => document.getElementById(`et-tab-${tab}`)?.focus());
    }
  }

  onTabKeydown(event: KeyboardEvent): void {
    const order: EditorTab[] = ['edit', 'history'];
    const index = order.indexOf(this.tab);
    let next: EditorTab | null = null;
    if (event.key === 'ArrowRight') {
      next = order[(index + 1) % order.length];
    } else if (event.key === 'ArrowLeft') {
      next = order[(index - 1 + order.length) % order.length];
    } else if (event.key === 'Home') {
      next = order[0];
    } else if (event.key === 'End') {
      next = order[order.length - 1];
    }
    if (next) {
      event.preventDefault();
      this.selectTab(next, true);
    }
  }

  async loadHistory(): Promise<void> {
    this.historyLoading = true;
    this.historyFailed = false;
    try {
      const history = await this.api.history(this.templateId);
      if (this.destroyed) return;
      this.history = history;
      this.historyLoaded = true;
    } catch (error) {
      this.historyFailed = true;
      this.logger.error('Email template history failed to load');
    } finally {
      this.historyLoading = false;
    }
  }

  // ---- Mutations -----------------------------------------------------------

  async openPublish(): Promise<void> {
    if (this.publishDisabled || !this.state) {
      return;
    }
    this.busy = 'prepare-publish';
    const saved = await this.settleSave();
    this.busy = null;
    if (
      !saved ||
      this.diagnostics.some(item => item.severity !== 'warning') ||
      !this.state ||
      this.draftRevision === null
    ) {
      return;
    }
    const before = this.state.live ?? this.state.suppliedDefault;
    this.publishSummary = {
      nextVersion: this.state.latestVersion + 1,
      oldSubject: before.subject,
      newSubject: this.content.subject,
      changedLines: changedLineCount(before.body, this.content.body),
      formatChanged:
        before.format === this.content.format ? null : { oldFormat: before.format, newFormat: this.content.format },
    };
    this.dialog = 'publish';
  }

  async confirmPublish(): Promise<void> {
    if (!this.state || this.draftRevision === null) {
      return;
    }
    await this.mutate('publish', async () => {
      const response = await this.api.publish(this.templateId, this.draftRevision!, this.state!.live?.token ?? null);
      this.closeDialog(true);
      this.applyState(response.state);
      const version = response.state.live?.token.revision ?? response.state.latestVersion;
      this.announce('email-templates-published', { version });
      this.infoMessage = response.draftRetained
        ? { key: 'email-templates-published-draft-retained', params: { version } }
        : { key: 'email-templates-published', params: { version } };
    });
  }

  async openReset(): Promise<void> {
    if (!this.state?.live) {
      return;
    }
    this.dialog = 'reset';
  }

  async confirmReset(): Promise<void> {
    const token = this.state?.live?.token;
    if (!token) {
      return;
    }
    await this.mutate('reset', async () => {
      if (!(await this.settleSave())) {
        return;
      }
      const response = await this.api.reset(this.templateId, token);
      this.closeDialog(true);
      this.applyState(response.state);
      this.announce('email-templates-reset-done');
      this.infoMessage = { key: 'email-templates-reset-done' };
    });
  }

  openDiscard(): void {
    if (this.hasDraft || this.dirty) {
      this.dialog = 'discard';
    }
  }

  async confirmDiscard(): Promise<void> {
    await this.mutate('discard', async () => {
      await this.abandonPendingSave();
      if (this.conflictContent) {
        return;
      }
      if (this.draftRevision !== null) {
        await this.api.discardDraft(this.templateId, this.draftRevision);
      }
      this.closeDialog(true);
      await this.load();
      this.announce('email-templates-draft-discarded');
    });
  }

  requestDraftFromDefault(): void {
    if (this.hasDraft || this.dirty) {
      this.dialog = 'from-default';
      return;
    }
    void this.confirmDraftFromDefault();
  }

  async confirmDraftFromDefault(): Promise<void> {
    await this.mutate('from-default', async () => {
      await this.abandonPendingSave();
      if (this.conflictContent) {
        return;
      }
      const response = await this.api.draftFromDefault(this.templateId, this.draftRevision);
      this.closeDialog(true);
      this.applyDraft(response.draft, response.diagnostics);
      this.tab = 'edit';
      this.announce('email-templates-draft-from-default-done');
    });
  }

  viewVersion(entry: EmailAdminHistory): void {
    this.viewing = entry;
    this.dialog = 'view';
  }

  requestRestore(entry: EmailAdminHistory): void {
    if (entry.event === 'reset' || !entry.applied) {
      return;
    }
    this.pendingRestore = entry;
    if (this.hasDraft || this.dirty) {
      this.dialog = 'restore';
      return;
    }
    void this.confirmRestore();
  }

  async confirmRestore(): Promise<void> {
    const entry = this.pendingRestore;
    if (!entry) {
      return;
    }
    await this.mutate('restore', async () => {
      await this.abandonPendingSave();
      if (this.conflictContent) {
        return;
      }
      const response = await this.api.restore(this.templateId, entry.version, this.draftRevision);
      this.closeDialog(true);
      this.applyDraft(response.draft, response.diagnostics);
      this.selectTab('edit', true);
      this.infoMessage = { key: 'email-templates-restored', params: { version: entry.version } };
      this.announce('email-templates-restored', { version: entry.version });
    });
  }

  closeDialog(force = false): void {
    if (this.busy && !force) return;
    this.dialog = null;
    this.pendingRecord = null;
    this.pendingRestore = null;
    this.publishSummary = null;
    this.viewing = null;
    this.sampleSchema = null;
  }

  /** Escape on the conflict dialog must not silently drop the held content. */
  dismissDialog(): void {
    if (this.busy || this.dialog === 'conflict') {
      return;
    }
    this.closeDialog();
  }

  async goBack(): Promise<void> {
    if (await this.prepareToLeave()) {
      this.back.emit();
    }
  }

  private async mutate(key: string, work: () => Promise<void>): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = key;
    this.errorMessage = null;
    try {
      await work();
    } catch (error) {
      if (isApiError(error) && error.isConflict) {
        this.openConflict(error);
      } else {
        this.closeDialog(true);
        this.showError(error);
      }
    } finally {
      this.busy = null;
    }
  }

  // ---- Messages ------------------------------------------------------------

  private errorKey(error: unknown): string {
    const code = isApiError(error) ? error.code : 'UNAVAILABLE';
    const known = [
      'FORBIDDEN',
      'UNKNOWN_TEMPLATE',
      'UNKNOWN_VERSION',
      'MISSING_DEFAULT',
      'LENGTH_LIMIT',
      'INVALID_TEMPLATE',
      'INVALID_CONTEXT',
      'INCOMPLETE_TRANSITION',
      'PERSISTENCE',
      'SANITISATION_FAILED',
    ];
    return known.includes(code) ? `email-templates-error-${code}` : 'email-templates-error-UNAVAILABLE';
  }

  private showError(error: unknown): void {
    this.errorMessage = { key: this.errorKey(error) };
    this.logger.error('Email template operation failed', isApiError(error) ? error.code : 'UNAVAILABLE');
  }

  private announce(key: string, params?: Record<string, unknown>): void {
    if (this.destroyed) return;
    // Clear first so repeating the same message is announced again.
    this.announcement = '';
    setTimeout(() => {
      if (this.destroyed) return;
      this.announcement = this.i18n.t(key, params as never);
    }, 50);
  }

  private clearTimer(which: 'validate' | 'preview' | 'save'): void {
    if (which === 'validate' && this.validateTimer) {
      clearTimeout(this.validateTimer);
      this.validateTimer = null;
    } else if (which === 'preview' && this.previewTimer) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    } else if (which === 'save' && this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearTimer('validate');
    this.clearTimer('preview');
    this.clearTimer('save');
  }
}
