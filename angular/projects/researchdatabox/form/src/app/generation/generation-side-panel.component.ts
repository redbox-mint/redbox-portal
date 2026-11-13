import {
  Component,
  computed,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  signal,
  untracked,
  ViewChild,
} from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import {
  GenerationCandidatePatch,
  GenerationDocument,
  GenerationLaunchDefinition,
  GenerationQuestion,
  GenerationQuestionValue,
  GenerationRunView,
  GenerationRuntimeSession,
} from '@researchdatabox/sails-ng-common';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { GenerationApiService } from './generation-api.service';
import { GenerationPatchApplierService } from './generation-patch-applier.service';
import { GenerationProvenanceStoreService } from './generation-provenance-store.service';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import {
  createGenerationLifecycleChangedEvent,
  FormComponentEventType,
} from '../form-state/events/form-component-event.types';
import * as GenerationActions from './state/generation.actions';
import { selectGenerationPanelOpen } from './state/generation.selectors';

@Component({
  selector: 'redbox-generation-side-panel',
  templateUrl: './generation-side-panel.component.html',
  standalone: false,
})
export class GenerationSidePanelComponent implements OnDestroy {
  readonly session = input<GenerationRuntimeSession | null>(null);
  readonly launches = input<GenerationLaunchDefinition[]>([]);
  readonly inline = input(false);
  readonly form = input<FormGroup | undefined>();
  readonly recordType = input<string>('');
  readonly formName = input<string>('');
  readonly isOpen = this.store.selectSignal(selectGenerationPanelOpen);
  readonly questions = signal<GenerationQuestion[]>([]);
  readonly run = signal<GenerationRunView | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly conflicts = signal<string[]>([]);
  readonly candidate = signal<GenerationCandidatePatch | null>(null);
  readonly activeSession = signal<GenerationRuntimeSession | null>(null);
  readonly inlineOpen = signal(false);
  private readonly suppliedSession = signal<GenerationRuntimeSession | null>(null);
  readonly effectiveSession = computed(() => this.activeSession() ?? this.suppliedSession());
  readonly visible = computed(() => {
    const hasContent = !!this.effectiveSession() || !!this.error();
    return hasContent && (this.inline() ? this.inlineOpen() : this.isOpen());
  });
  readonly documents = signal<GenerationDocument[]>([]);
  readonly documentsReviewed = signal(false);
  readonly documentNotes = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] });
  readonly documentLaunch = computed(() => this.launches().find((launch) => launch.allowDocumentsOnly));
  readonly documentAccept = computed(() => this.run()?.documentPolicy?.formats.map((format) => `.${format}`).join(',') ?? '');
  readonly completed = computed(() => this.candidate() !== null);
  readonly restartRequired = computed(() => {
    const status = this.run()?.status;
    return status !== undefined && ['failed', 'cancelled', 'expired'].includes(status);
  });
  readonly progressLabel = computed(() => {
    const current = this.run();
    return current ? `generation-phase-${current.phase}` : 'generation-phase-context';
  });
  readonly questionForm = new FormGroup({});
  @ViewChild('panelTitle') private panelTitle?: ElementRef<HTMLElement>;
  private readonly document = inject(DOCUMENT);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly subscriptions = new Subscription();
  private formRoot: HTMLElement | null = null;
  private observedForm?: FormGroup;
  private observedSession: GenerationRuntimeSession | null | undefined;
  private invalidatedSession: GenerationRuntimeSession | null | undefined;
  private destroyed = false;
  private operationRevision = 0;
  private pollDelay?: { timer: ReturnType<typeof setTimeout>; resolve: () => void };
  private executionSnapshot: Record<string, unknown> = {};
  private restoreFocusTo: HTMLElement | null = null;

  constructor(
    private readonly api: GenerationApiService,
    private readonly applier: GenerationPatchApplierService,
    public readonly provenance: GenerationProvenanceStoreService,
    private readonly eventBus: FormComponentEventBus,
    private readonly store: Store,
  ) {
    effect(() => {
      const session = this.session();
      const form = this.form();
      untracked(() => {
        if (form === this.observedForm && session === this.observedSession) return;
        if (this.observedForm && form !== this.observedForm && session === this.observedSession) {
          this.invalidatedSession = session;
        }
        this.observedForm = form;
        this.observedSession = session;
        this.resetFormContext();
        if (session && form && session !== this.invalidatedSession) {
          this.suppliedSession.set(session);
          if (this.inline()) this.inlineOpen.set(true);
          void this.initialise(session, form);
        }
      });
    });
    effect(() => {
      const shouldPositionInline = this.inline() && this.launches().length > 0;
      if (shouldPositionInline) {
        untracked(() => queueMicrotask(() => this.positionInlineHost()));
      }
    });
    this.subscriptions.add(this.eventBus.select$(FormComponentEventType.FORM_DEFINITION_READY).subscribe(() => {
      queueMicrotask(() => this.positionInlineHost());
    }));
    this.subscriptions.add(this.eventBus.select$(FormComponentEventType.FORM_SAVE_SUCCESS).subscribe((event) => {
      if (event.oid && this.candidate()) void this.commitAfterSave(event.oid);
    }));
    this.subscriptions.add(this.eventBus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe((event) => {
      if (event.origin === 'generation') return;
      void this.maybeLaunchFromSelection(event.fieldId);
      const item = this.candidate()?.items.find((candidateItem) => this.pointerMatchesFieldId(candidateItem.metadataPointer, event.fieldId));
      const provenancePointer = item?.metadataPointer
        ?? Object.keys(this.provenance.byPointer()).find((pointer) => this.pointerMatchesFieldId(pointer, event.fieldId));
      if (provenancePointer) {
        this.provenance.markEdited(provenancePointer, event.value);
      }
      if (item?.reviewRequired) {
        this.store.dispatch(GenerationActions.fieldReviewed({ fieldId: item.fieldId }));
      }
    }));
  }

  private pointerMatchesFieldId(pointer: string, fieldId: string): boolean {
    return pointer === fieldId || this.pointerFieldId(pointer) === fieldId;
  }

  public ngOnDestroy(): void {
    this.destroyed = true;
    this.operationRevision++;
    this.stopPollDelay();
    this.subscriptions.unsubscribe();
  }

  public async generate(): Promise<void> {
    const currentSession = this.effectiveSession();
    const form = this.form();
    const activeRun = ['queued', 'running', 'validating', 'cancelRequested', 'committing'].includes(this.run()?.status ?? '');
    if (this.destroyed || !currentSession || !form || activeRun || this.busy() || this.completed() || this.questionForm.invalid || this.documentNotes.invalid ||
      (this.documents().length > 0 && !this.documentsReviewed())) return;
    const revision = this.operationRevision;
    this.busy.set(true);
    this.error.set(null);
    this.executionSnapshot = structuredClone(form.getRawValue());
    try {
      const retainedAnswers = this.questionValues();
      const session = await this.ensureExecutableSession(currentSession, form, retainedAnswers, revision);
      if (!this.isCurrentOperation(revision, form, session.runId)) return;
      const sourcePointer = this.launches().find((launch) => launch.bindingKey === session.bindingKey)?.sourcePointer;
      const selectedSource = sourcePointer ? this.readPointer(form.getRawValue(), sourcePointer) : undefined;
      const run = await this.api.execute(session.runId, {
        ...(sourcePointer ? { sourceOid: typeof selectedSource === 'string' && selectedSource.trim() ? selectedSource.trim() : null } : {}),
        answers: this.questions().map((question) => ({ id: question.id, value: this.questionForm.get(question.id)?.value })),
        targetForm: {
          recordType: this.recordType(),
          ...(this.formName() ? { formName: this.formName() } : {}),
          mode: 'create',
        },
        targetDraft: this.executionSnapshot,
        ...(this.documents().length ? {
          documentIds: this.documents().map((document) => document.id),
          documentsReviewed: this.documentsReviewed(),
          documentNotes: this.documentNotes.value,
        } : {}),
      });
      if (!this.isCurrentOperation(revision, form, session.runId)) return;
      this.consumeRun(run, form);
      await this.pollUntilSettled(session.runId, form, revision);
    } catch (error) {
      if (this.isCurrentOperation(revision, form)) this.fail(error);
    } finally {
      if (this.isCurrentOperation(revision, form)) this.busy.set(false);
    }
  }

  public async startWithDocuments(): Promise<void> {
    const launch = this.documentLaunch();
    const form = this.form();
    if (!launch || !form || this.destroyed || this.busy() || this.effectiveSession() || this.completed()) return;
    const revision = this.operationRevision;
    this.busy.set(true);
    this.error.set(null);
    try {
      const selected = launch.sourcePointer ? this.readPointer(form.getRawValue(), launch.sourcePointer) : undefined;
      const sourceOid = typeof selected === 'string' && selected.trim() ? selected.trim() : undefined;
      const result = await this.api.launch({ bindingKey: launch.bindingKey, ...(sourceOid ? { sourceOid } : {}) });
      if (!this.isCurrentOperation(revision, form)) return;
      const session: GenerationRuntimeSession = {
        runId: result.runId, bindingKey: launch.bindingKey, autoOpen: true,
        initialValues: sourceOid && launch.sourcePointer ? [{ metadataPointer: launch.sourcePointer, value: sourceOid }] : [],
      };
      this.activeSession.set(session);
      this.inlineOpen.set(true);
      this.store.dispatch(GenerationActions.openPanel());
      await this.initialise(session, form);
    } catch (error) { if (this.isCurrentOperation(revision, form)) this.fail(error); }
    finally { if (this.isCurrentOperation(revision, form)) this.busy.set(false); }
  }

  public async uploadDocument(event: Event): Promise<void> {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const file = input?.files?.[0];
    const session = this.effectiveSession();
    const form = this.form();
    if (!file || !session || !form || this.destroyed || this.busy()) return;
    const revision = this.operationRevision;
    this.busy.set(true);
    this.error.set(null);
    try {
      if (file.size > (this.run()?.documentPolicy?.maxFileBytes ?? 0)) {
        throw new Error('generation-error-generation-document-limit');
      }
      const run = await this.api.addDocument(session.runId, file);
      if (!this.isCurrentOperation(revision, form, session.runId)) return;
      this.updateRun(run);
      this.documentsReviewed.set(false);
    } catch (error) {
      if (this.isCurrentOperation(revision, form, session.runId)) this.fail(error);
    } finally {
      if (this.isCurrentOperation(revision, form)) this.busy.set(false);
      if (input) input.value = '';
    }
  }

  public async removeDocument(documentId: string): Promise<void> {
    const session = this.effectiveSession();
    const form = this.form();
    if (!session || !form || this.destroyed || this.busy()) return;
    const revision = this.operationRevision;
    this.busy.set(true);
    try {
      const run = await this.api.removeDocument(session.runId, documentId);
      if (!this.isCurrentOperation(revision, form, session.runId)) return;
      this.updateRun(run);
      this.documentsReviewed.set(false);
      if (!this.documents().length) this.documentNotes.setValue('');
    } catch (error) {
      if (this.isCurrentOperation(revision, form, session.runId)) this.fail(error);
    } finally {
      if (this.isCurrentOperation(revision, form)) this.busy.set(false);
    }
  }

  public async cancel(): Promise<void> {
    const session = this.effectiveSession();
    const form = this.form();
    if (!form || this.destroyed) return;
    const revision = this.operationRevision;
    const status = this.run()?.status;
    if (session && status && ['draft', 'queued', 'running', 'validating', 'cancelRequested'].includes(status)) {
      try {
        const run = await this.api.cancel(session.runId);
        if (!this.isCurrentOperation(revision, form, session.runId)) return;
        this.updateRun(run);
      } catch (error) {
        if (this.isCurrentOperation(revision, form, session.runId)) this.fail(error);
        return;
      }
    }
    if (this.isCurrentOperation(revision, form)) this.close();
  }

  public close(): void {
    this.store.dispatch(GenerationActions.closePanel());
    this.inlineOpen.set(false);
    this.activeSession.set(null);
    this.documents.set([]);
    this.documentsReviewed.set(false);
    this.documentNotes.reset('');
    queueMicrotask(() => this.restoreFocusTo?.focus());
  }

  public async markReviewed(fieldId: string, pointer: string): Promise<void> {
    const form = this.form();
    if (!form) return;
    const revision = this.operationRevision;
    await this.provenance.markReviewed(pointer);
    if (!this.isCurrentOperation(revision, form)) return;
    this.store.dispatch(GenerationActions.fieldReviewed({ fieldId }));
  }

  private async initialise(session: GenerationRuntimeSession, form: FormGroup): Promise<void> {
    if (this.destroyed || this.form() !== form) return;
    const revision = ++this.operationRevision;
    this.stopPollDelay();
    this.busy.set(true);
    this.candidate.set(null);
    this.conflicts.set([]);
    this.restoreFocusTo = this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;
    this.provenance.clear();
    this.applier.applyInitialValues(session.initialValues, form, this.eventBus, session.runId);
    // A completed run may be reopened before the new record is saved. Rebuild
    // the same baseline used by a live execution so unchanged blank/default
    // fields are populated rather than being reported as edit conflicts.
    this.executionSnapshot = structuredClone(form.getRawValue());
    try {
      const run = await this.api.getRun(session.runId);
      if (!this.isCurrentOperation(revision, form, session.runId)) return;
      this.configureQuestions(run.questions);
      this.consumeRun(run, form);
      queueMicrotask(() => { if (this.isCurrentOperation(revision, form, session.runId)) this.panelTitle?.nativeElement.focus(); });
      if (['queued', 'running', 'validating', 'cancelRequested'].includes(run.status)) {
        await this.pollUntilSettled(session.runId, form, revision);
      }
    } catch (error) {
      if (this.isCurrentOperation(revision, form)) this.fail(error);
    } finally {
      if (this.isCurrentOperation(revision, form)) this.busy.set(false);
    }
  }

  private configureQuestions(
    questions: GenerationQuestion[],
    retainedAnswers: ReadonlyMap<string, GenerationQuestionValue> = new Map(),
  ): void {
    this.questions.set(questions);
    for (const existing of Object.keys(this.questionForm.controls)) this.questionForm.removeControl(existing);
    for (const question of questions) {
      this.questionForm.addControl(question.id, new FormControl<GenerationQuestionValue>(
        retainedAnswers.has(question.id) ? retainedAnswers.get(question.id) ?? null : question.defaultValue ?? null,
        this.questionValidators(question),
      ));
    }
  }

  private questionValues(): ReadonlyMap<string, GenerationQuestionValue> {
    return new Map(this.questions().map((question) => [
      question.id,
      this.questionForm.get(question.id)?.value as GenerationQuestionValue,
    ]));
  }

  private async ensureExecutableSession(
    session: GenerationRuntimeSession,
    form: FormGroup,
    retainedAnswers: ReadonlyMap<string, GenerationQuestionValue>,
    revision: number,
  ): Promise<GenerationRuntimeSession> {
    if (!this.restartRequired() || (this.run()?.status === 'failed' && this.run()?.retryable)) return session;
    if (this.documents().length) throw new Error('generation-document-reupload');

    const launch = this.launches().find((candidate) => candidate.bindingKey === session.bindingKey);
    if (!launch) throw new Error('generation-request-failed');
    const selectedSource = launch.sourcePointer ? this.readPointer(form.getRawValue(), launch.sourcePointer)
      ?? session.initialValues.find((value) => value.metadataPointer === launch.sourcePointer)?.value : undefined;
    if (!launch.allowDocumentsOnly && (typeof selectedSource !== 'string' || !selectedSource.trim())) {
      throw new Error('generation-request-failed');
    }

    const sourceOid = typeof selectedSource === 'string' && selectedSource.trim() ? selectedSource.trim() : undefined;
    const result = await this.api.launch({ bindingKey: launch.bindingKey, ...(sourceOid ? { sourceOid } : {}) });
    if (!this.isCurrentOperation(revision, form, session.runId)) return session;
    const replacement: GenerationRuntimeSession = {
      runId: result.runId,
      bindingKey: launch.bindingKey,
      autoOpen: true,
      initialValues: launch.sourcePointer && sourceOid ? [{ metadataPointer: launch.sourcePointer, value: sourceOid }] : [],
    };
    const freshRun = await this.api.getRun(replacement.runId);
    if (!this.isCurrentOperation(revision, form, session.runId)) return session;
    this.activeSession.set(replacement);
    this.configureQuestions(freshRun.questions, retainedAnswers);
    this.updateRun(freshRun);
    return replacement;
  }

  private resetFormContext(): void {
    this.operationRevision++;
    this.stopPollDelay();
    this.activeSession.set(null);
    this.suppliedSession.set(null);
    this.run.set(null);
    this.candidate.set(null);
    this.conflicts.set([]);
    this.questions.set([]);
    for (const question of Object.keys(this.questionForm.controls)) this.questionForm.removeControl(question);
    this.documents.set([]);
    this.documentsReviewed.set(false);
    this.documentNotes.reset('');
    this.inlineOpen.set(false);
    this.busy.set(false);
    this.error.set(null);
    this.executionSnapshot = {};
    // FormComponent owns loading/clearing persisted provenance for the next record.
  }

  private isCurrentOperation(revision: number, form: FormGroup, runId?: string): boolean {
    return !this.destroyed && revision === this.operationRevision && form === this.form() &&
      this.session() === this.observedSession && (!runId || this.effectiveSession()?.runId === runId);
  }

  private stopPollDelay(): void {
    if (!this.pollDelay) return;
    clearTimeout(this.pollDelay.timer);
    this.pollDelay.resolve();
    this.pollDelay = undefined;
  }

  private waitForPoll(delayMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.pollDelay = undefined;
        resolve();
      }, delayMs);
      this.pollDelay = { timer, resolve };
    });
  }

  private async pollUntilSettled(runId: string, form: FormGroup, revision: number): Promise<void> {
    let delayMs = 750;
    for (let attempt = 0; attempt < 80 && this.isCurrentOperation(revision, form, runId); attempt += 1) {
      const current = this.run();
      if (!current || current.runId !== runId || ['completed', 'failed', 'cancelled', 'expired', 'committed'].includes(current.status)) break;
      await this.waitForPoll(delayMs);
      if (!this.isCurrentOperation(revision, form, runId)) return;
      const next = await this.api.getRun(runId);
      if (!this.isCurrentOperation(revision, form, runId)) return;
      this.consumeRun(next, form);
      if (next.result) break;
      delayMs = Math.min(Math.round(delayMs * 1.45), 4000);
    }
  }

  private consumeRun(run: GenerationRunView, form: FormGroup): void {
    this.updateRun(run);
    if (run.result) this.applyCandidate(run.result, form, run.completionValues ?? []);
  }

  private updateRun(run: GenerationRunView): void {
    this.run.set(run);
    if (run.documents && ['draft', 'failed'].includes(run.status)) {
      const changed = this.documents().map((document) => document.id).join() !== run.documents.map((document) => document.id).join();
      this.documents.set(run.documents);
      if (changed) this.documentsReviewed.set(false);
    }
    this.error.set(run.error?.messageKey ?? null);
    this.store.dispatch(GenerationActions.lifecycleChanged({
      status: run.status,
      phase: run.phase,
      questions: run.questions,
      candidate: run.result,
      error: run.error?.messageKey ?? null,
    }));
    this.eventBus.publish(createGenerationLifecycleChangedEvent({
      runId: run.runId,
      status: run.status,
      phase: run.phase,
      error: run.error?.messageKey,
      sourceId: 'generation',
      origin: 'generation',
      correlationId: run.runId,
    }));
  }

  private applyCandidate(
    candidate: GenerationCandidatePatch,
    form: FormGroup,
    completionValues: GenerationRunView['completionValues'] = [],
  ): void {
    const result = this.applier.apply(
      candidate,
      form,
      this.executionSnapshot,
      this.eventBus,
      completionValues,
    );
    this.candidate.set(candidate);
    this.conflicts.set(result.conflictFieldIds);
    this.provenance.setPending(candidate);
    this.store.dispatch(GenerationActions.patchApplied({ candidate, conflictFieldIds: result.conflictFieldIds }));
  }

  private async commitAfterSave(targetOid: string): Promise<void> {
    const candidate = this.candidate();
    const form = this.form();
    if (!candidate || !form || this.destroyed) return;
    const revision = this.operationRevision;
    this.store.dispatch(GenerationActions.commitStarted());
    const reviewedFieldIds = candidate.items
      .filter((item) => item.reviewRequired && !this.provenance.byPointer()[item.metadataPointer]?.reviewRequired)
      .map((item) => item.fieldId);
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!this.isCurrentOperation(revision, form)) return;
      try {
        await this.api.commit(candidate.runId, { targetOid, candidateDigest: candidate.candidateDigest, reviewedFieldIds });
        if (!this.isCurrentOperation(revision, form)) return;
        this.store.dispatch(GenerationActions.commitFinished());
        await this.provenance.load(targetOid);
        return;
      } catch (error) {
        if (!this.isCurrentOperation(revision, form)) return;
        lastError = error;
        await new Promise<void>((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    if (!this.isCurrentOperation(revision, form)) return;
    const message = lastError instanceof Error ? lastError.message : 'generation-commit-failed';
    this.store.dispatch(GenerationActions.commitFailed({ error: message }));
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : 'generation-request-failed';
    this.error.set(message);
    if (this.inline()) this.inlineOpen.set(true);
    this.eventBus.publish(createGenerationLifecycleChangedEvent({
      runId: this.effectiveSession()?.runId,
      error: message,
      sourceId: 'generation',
      origin: 'generation',
      correlationId: this.effectiveSession()?.runId,
    }));
  }

  private pointerFieldId(pointer: string): string {
    return pointer.split('/').filter(Boolean).at(-1)?.replaceAll('~1', '/').replaceAll('~0', '~') ?? pointer;
  }

  private positionInlineHost(): void {
    if (!this.inline()) return;

    const host = this.hostElement.nativeElement;
    this.formRoot ??= host.closest<HTMLElement>('redbox-form');
    if (!this.formRoot) return;

    const sourcePointers = new Set(
      this.launches()
        .map((launch) => this.rootPointer(launch.sourcePointer))
        .filter((pointer): pointer is string => pointer !== null),
    );
    const sourceField = Array.from(
      this.formRoot.querySelectorAll<HTMLElement>('.rb-form-components > redbox-form-base-wrapper'),
    ).find((wrapper) => sourcePointers.has(wrapper.getAttribute('data-metadata-pointer') ?? ''));
    if (!sourceField || sourceField.nextElementSibling === host) return;

    sourceField.insertAdjacentElement('afterend', host);
  }

  private rootPointer(pointer?: string): string | null {
    const rootSegment = pointer?.split('/').filter(Boolean)[0];
    return rootSegment ? `/${rootSegment}` : null;
  }

  private async maybeLaunchFromSelection(fieldId?: string): Promise<void> {
    const form = this.form();
    const normalizedFieldId = String(fieldId ?? '').split('/').filter(Boolean).at(-1) ?? '';
    const launch = this.launches().find((candidate) => {
      if (!candidate.sourcePointer) return false;
      const segments = candidate.sourcePointer.split('/').filter(Boolean);
      return segments[0] === normalizedFieldId || this.pointerFieldId(candidate.sourcePointer) === normalizedFieldId;
    });
    if (!form || !launch?.sourcePointer || this.destroyed || this.effectiveSession() || this.busy()) return;
    const sourceOid = this.readPointer(form.getRawValue(), launch.sourcePointer);
    if (typeof sourceOid !== 'string' || !sourceOid.trim()) return;

    const revision = this.operationRevision;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.api.launch({ bindingKey: launch.bindingKey, sourceOid: sourceOid.trim() });
      if (!this.isCurrentOperation(revision, form)) return;
      const session: GenerationRuntimeSession = {
        runId: result.runId,
        bindingKey: launch.bindingKey,
        autoOpen: true,
        initialValues: [{ metadataPointer: launch.sourcePointer, value: sourceOid.trim() }],
      };
      this.activeSession.set(session);
      if (this.inline()) this.inlineOpen.set(true);
      await this.initialise(session, form);
    } catch (error) {
      if (this.isCurrentOperation(revision, form)) this.fail(error);
    } finally {
      if (this.isCurrentOperation(revision, form)) this.busy.set(false);
    }
  }

  private readPointer(value: unknown, pointer: string): unknown {
    let current: unknown = value;
    for (const segment of pointer.split('/').slice(1).map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
      if (!current || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  private questionValidators(question: GenerationQuestion): ValidatorFn[] {
    const validators: ValidatorFn[] = [];
    if (question.required) {
      validators.push(question.type === 'boolean'
        ? (control: AbstractControl): ValidationErrors | null => control.value === null || control.value === undefined ? { required: true } : null
        : Validators.required);
    }
    if (question.maxLength !== undefined && ['text', 'textarea'].includes(question.type)) {
      validators.push(Validators.maxLength(question.maxLength));
    }
    return validators;
  }
}
