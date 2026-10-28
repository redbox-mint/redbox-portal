import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  OnChanges,
  ViewChild,
} from '@angular/core';
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
  | 'conflict';

interface PublishSummary {
  nextVersion: number;
  oldSubject: string;
  newSubject: string;
  changedLines: number;
}

interface Message {
  key: string;
  params?: Record<string, unknown>;
}

@Component({
  selector: 'email-templates-editor',
  standalone: true,
  imports: [
    FormsModule,
    I18NextPipe,
    WhenPipe,
    CodeEditorComponent,
    DialogComponent,
    HistoryPanelComponent,
    PreviewFrameComponent,
    RecordPickerComponent,
  ],
  templateUrl: './editor.component.html',
  styleUrls: ['./email-templates.shared.scss', './editor.component.scss'],
})
export class EditorComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) templateId = '';
  @Input() brandName = '';
  /** Record picked in an earlier editor, so moving between templates keeps the preview data. */
  @Input() initialRecord: EmailPreviewRecord | null = null;
  @Output() back = new EventEmitter<void>();
  @Output() recordChange = new EventEmitter<EmailPreviewRecord | null>();

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

  constructor(
    private api: EmailTemplateAdminService,
    @Inject(TranslationService) private i18n: TranslationService,
    @Inject(LoggerService) private logger: LoggerService
  ) {}

  ngOnInit(): void {
    void this.init();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['templateId'];
    if (change && !change.firstChange && change.currentValue !== change.previousValue) {
      this.clearTimers();
      this.state = null;
      this.tab = 'edit';
      this.history = [];
      this.preview = null;
      this.record = null;
      this.recordContextText = null;
      this.contextText = '';
      this.closeDialog();
      void this.init();
    }
  }

  ngOnDestroy(): void {
    // Leaving with unsaved edits (for example via the browser Back button):
    // flush them rather than dropping the pending autosave.
    const flush = this.dirty && !this.conflictContent && !!this.state;
    this.clearTimers();
    if (flush) {
      void this.save();
    }
    this.destroyed = true;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty || this.saving) {
      event.preventDefault();
    }
  }

  // ---- Derived state -------------------------------------------------------

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

  get bodyDiagnostics(): EmailAdminDiagnostic[] {
    return this.diagnostics.filter(item => item.field !== 'subject');
  }

  get bodyErrorLines(): number[] {
    return [...new Set(this.bodyDiagnostics.map(item => item.line))];
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
    if (this.diagnostics.length) {
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
    if (this.state && this.initialRecord) {
      void this.loadRecord(this.initialRecord);
    }
  }

  async load(): Promise<void> {
    this.loading = true;
    this.loadError = null;
    try {
      this.applyState(await this.api.editorState(this.templateId));
    } catch (error) {
      this.loadError = this.errorKey(error);
      this.logger.error('Email template editor failed to load', error);
    } finally {
      this.loading = false;
    }
  }

  /** Replace server state wholesale and reset the working copy from it. */
  private applyState(state: EmailAdminEditorState): void {
    this.clearTimer('save');
    this.state = state;
    const source = state.draft ?? state.live ?? state.suppliedDefault;
    this.content = copyContent(source);
    this.baseline = copyContent(source);
    this.draftRevision = state.draft?.draftRevision ?? null;
    this.lastSavedAt = state.draft?.updatedAt ?? null;
    this.saveFailed = false;
    this.diagnostics = [];
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
    if (this.state) {
      this.state = { ...this.state, draft };
    }
    this.content = copyContent(draft);
    this.baseline = copyContent(draft);
    this.draftRevision = draft.draftRevision;
    this.lastSavedAt = draft.updatedAt;
    this.diagnostics = diagnostics;
    this.saveFailed = false;
    this.previewSource = 'working';
    this.scheduleValidate(0);
    this.schedulePreview(0);
  }

  // ---- Editing -------------------------------------------------------------

  onSubjectChange(value: string): void {
    this.content = { ...this.content, subject: value };
    this.onContentChange();
  }

  onBodyChange(value: string): void {
    this.content = { ...this.content, body: value };
    this.onContentChange();
  }

  onFormatChange(format: EmailTemplateFormat): void {
    if (format === this.content.format) {
      return;
    }
    this.content = { ...this.content, format };
    this.onContentChange();
  }

  private onContentChange(): void {
    this.infoMessage = null;
    this.previewSource = 'working';
    this.scheduleValidate(VALIDATE_DEBOUNCE_MS);
    this.schedulePreview(PREVIEW_DEBOUNCE_MS);
    if (!this.conflictContent) {
      this.scheduleSave(AUTOSAVE_DEBOUNCE_MS);
    }
  }

  insertToken(text: string): void {
    this.bodyEditor?.insertAtCursor(text);
  }

  variableToken(root: string): string {
    return `{{${root}}}`;
  }

  helperToken(helper: string): string {
    return `{{${helper} }}`;
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

  /** Human message for a diagnostic, naming the identifier from local source when possible. */
  diagnosticMessage(diagnostic: EmailAdminDiagnostic): string {
    const source = diagnostic.field === 'subject' ? this.content.subject : this.content.body;
    const name = identifierAt(source, diagnostic.line, diagnostic.column);
    const reason = diagnostic.reason || diagnostic.code;
    const known = [
      'UNKNOWN_CONTEXT_ROOT',
      'UNKNOWN_HELPER',
      'UNSUPPORTED_CONSTRUCT',
      'INVALID_SYNTAX',
      'EMPTY_CONTENT',
      'RENDER_FAILED',
      'LENGTH_LIMIT',
    ];
    if (!known.includes(reason)) {
      return this.i18n.t('email-templates-diagnostic-other');
    }
    if ((reason === 'UNKNOWN_CONTEXT_ROOT' || reason === 'UNKNOWN_HELPER') && name) {
      return this.i18n.t(`email-templates-diagnostic-${reason}-named`, { name, interpolation: RAW_INTERPOLATION });
    }
    return this.i18n.t(`email-templates-diagnostic-${reason}`);
  }

  diagnosticPosition(diagnostic: EmailAdminDiagnostic): string {
    return this.i18n.t('email-templates-diagnostic-position', { line: diagnostic.line, column: diagnostic.column });
  }

  // ---- Validation ----------------------------------------------------------

  private scheduleValidate(delay: number): void {
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
      return;
    }
    this.validating = true;
    try {
      const diagnostics = await this.api.validate(this.templateId, content);
      if (seq === this.validateSeq) {
        this.diagnostics = diagnostics;
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
      if (this.state) {
        this.state = { ...this.state, draft: response.draft };
      }
      this.draftRevision = response.draft.draftRevision;
      this.baseline = sent;
      this.lastSavedAt = response.draft.updatedAt;
      this.saveFailed = false;
      if (sameContent(sent, this.content) && !this.validatePending) {
        this.diagnostics = response.diagnostics;
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
    if (this.dirty && !this.conflictContent) {
      await this.save();
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
    this.rescuedContent = this.conflictContent;
    this.conflictContent = null;
    this.conflictError = null;
    this.dialog = null;
    this.errorMessage = null;
    await this.load();
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
    this.clearTimer('preview');
    ++this.previewSeq;
    this.previewing = !!this.contextText.trim();
    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      void this.runPreview();
    }, delay);
  }

  onContextChange(value: string): void {
    this.contextText = value;
    this.schedulePreview(PREVIEW_DEBOUNCE_MS);
  }

  async runPreview(): Promise<void> {
    const seq = ++this.previewSeq;
    const contextText = this.contextText;
    this.contextProblem = null;
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
    try {
      const parsed: unknown = JSON.parse(contextText);
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
      const preview = await this.api.preview(this.templateId, content, contextText);
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
    this.record = record;
    this.recordChange.emit(record);
    this.loadingContext = true;
    this.contextLoadError = null;
    try {
      const context = await this.api.recordContext(record.oid, this.templateId);
      if (seq !== this.contextSeq) {
        return;
      }
      const text = JSON.stringify(context, null, 2);
      this.recordContextText = text;
      this.contextText = text;
      this.schedulePreview(0);
    } catch (error) {
      if (seq === this.contextSeq) {
        this.contextLoadError =
          isApiError(error) && error.code === 'FORBIDDEN' ? 'email-templates-record-unavailable' : this.errorKey(error);
      }
    } finally {
      if (seq === this.contextSeq) {
        this.loadingContext = false;
      }
    }
  }

  resetContext(): void {
    if (this.recordContextText !== null) {
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
      this.history = await this.api.history(this.templateId);
      this.historyLoaded = true;
    } catch (error) {
      this.historyFailed = true;
      this.logger.error('Email template history failed to load', error);
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
    if (!saved || this.diagnostics.length || !this.state || this.draftRevision === null) {
      return;
    }
    const before = this.state.live ?? this.state.suppliedDefault;
    this.publishSummary = {
      nextVersion: this.state.latestVersion + 1,
      oldSubject: before.subject,
      newSubject: this.content.subject,
      changedLines: changedLineCount(before.body, this.content.body),
    };
    this.dialog = 'publish';
  }

  async confirmPublish(): Promise<void> {
    if (!this.state || this.draftRevision === null) {
      return;
    }
    await this.mutate('publish', async () => {
      const response = await this.api.publish(this.templateId, this.draftRevision!, this.state!.live?.token ?? null);
      this.closeDialog();
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
      if (!(await this.settleSave()) && this.conflictContent) {
        return;
      }
      const response = await this.api.reset(this.templateId, token);
      this.closeDialog();
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
      this.closeDialog();
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
      this.closeDialog();
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
      this.closeDialog();
      this.applyDraft(response.draft, response.diagnostics);
      this.selectTab('edit', true);
      this.infoMessage = { key: 'email-templates-restored', params: { version: entry.version } };
      this.announce('email-templates-restored', { version: entry.version });
    });
  }

  closeDialog(): void {
    this.dialog = null;
    this.pendingRecord = null;
    this.pendingRestore = null;
    this.publishSummary = null;
    this.viewing = null;
  }

  /** Escape on the conflict dialog must not silently drop the held content. */
  dismissDialog(): void {
    if (this.dialog === 'conflict') {
      return;
    }
    this.closeDialog();
  }

  async goBack(): Promise<void> {
    if (await this.settleSave()) {
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
        this.closeDialog();
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
    this.logger.error('Email template operation failed', isApiError(error) ? error.code : error);
  }

  private announce(key: string, params?: Record<string, unknown>): void {
    // Clear first so repeating the same message is announced again.
    this.announcement = '';
    setTimeout(() => {
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
