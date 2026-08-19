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
  readonly effectiveSession = computed(() => this.activeSession() ?? this.session());
  readonly visible = computed(() => {
    const hasContent = !!this.effectiveSession() || !!this.error();
    return hasContent && (this.inline() ? this.inlineOpen() : this.isOpen());
  });
  readonly completed = computed(() => this.candidate() !== null);
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
  private initialisedRunId = '';
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
      if (session && form && session.runId !== this.initialisedRunId) {
        this.initialisedRunId = session.runId;
        if (this.inline()) this.inlineOpen.set(true);
        untracked(() => void this.initialise(session, form));
      }
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
      const item = this.candidate()?.items.find((candidateItem) => this.pointerFieldId(candidateItem.metadataPointer) === event.fieldId);
      if (item) {
        this.provenance.markEdited(item.metadataPointer, event.value);
        if (item.reviewRequired) this.store.dispatch(GenerationActions.fieldReviewed({ fieldId: item.fieldId }));
      }
    }));
  }

  public ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  public async generate(): Promise<void> {
    const session = this.effectiveSession();
    const form = this.form();
    if (!session || !form || this.busy() || this.completed() || this.questionForm.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    this.executionSnapshot = structuredClone(form.getRawValue());
    try {
      const run = await this.api.execute(session.runId, {
        answers: this.questions().map((question) => ({ id: question.id, value: this.questionForm.get(question.id)?.value })),
        targetForm: {
          recordType: this.recordType(),
          ...(this.formName() ? { formName: this.formName() } : {}),
          mode: 'create',
        },
        targetDraft: this.executionSnapshot,
      });
      this.updateRun(run);
      await this.pollUntilSettled(session.runId);
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(false);
    }
  }

  public async cancel(): Promise<void> {
    const session = this.effectiveSession();
    const status = this.run()?.status;
    if (session && status && ['queued', 'running', 'validating', 'cancelRequested'].includes(status)) {
      try { this.updateRun(await this.api.cancel(session.runId)); } catch (error) { this.fail(error); return; }
    }
    this.close();
  }

  public close(): void {
    this.store.dispatch(GenerationActions.closePanel());
    this.inlineOpen.set(false);
    this.activeSession.set(null);
    queueMicrotask(() => this.restoreFocusTo?.focus());
  }

  public async retry(): Promise<void> {
    await this.generate();
  }

  public async markReviewed(fieldId: string, pointer: string): Promise<void> {
    await this.provenance.markReviewed(pointer);
    this.store.dispatch(GenerationActions.fieldReviewed({ fieldId }));
  }

  private async initialise(session: GenerationRuntimeSession, form: FormGroup): Promise<void> {
    this.restoreFocusTo = this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;
    this.provenance.clear();
    this.applier.applyInitialValues(session.initialValues, form, this.eventBus, session.runId);
    // A completed run may be reopened before the new record is saved. Rebuild
    // the same baseline used by a live execution so unchanged blank/default
    // fields are populated rather than being reported as edit conflicts.
    this.executionSnapshot = structuredClone(form.getRawValue());
    try {
      const run = await this.api.getRun(session.runId);
      this.configureQuestions(run.questions);
      this.updateRun(run);
      if (run.result) this.applyCandidate(run.result, form);
      queueMicrotask(() => this.panelTitle?.nativeElement.focus());
    } catch (error) {
      this.fail(error);
    }
  }

  private configureQuestions(questions: GenerationQuestion[]): void {
    this.questions.set(questions);
    for (const existing of Object.keys(this.questionForm.controls)) this.questionForm.removeControl(existing);
    for (const question of questions) {
      this.questionForm.addControl(question.id, new FormControl<GenerationQuestionValue>(
        question.defaultValue ?? null,
        this.questionValidators(question),
      ));
    }
  }

  private async pollUntilSettled(runId: string): Promise<void> {
    let delayMs = 750;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const current = this.run();
      if (!current || ['completed', 'failed', 'cancelled', 'expired', 'committed'].includes(current.status)) break;
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      const next = await this.api.getRun(runId);
      this.updateRun(next);
      if (next.result) {
        const form = this.form();
        if (form) this.applyCandidate(next.result, form);
        break;
      }
      delayMs = Math.min(Math.round(delayMs * 1.45), 4000);
    }
  }

  private updateRun(run: GenerationRunView): void {
    this.run.set(run);
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

  private applyCandidate(candidate: GenerationCandidatePatch, form: FormGroup): void {
    const result = this.applier.apply(candidate, form, this.executionSnapshot, this.eventBus);
    this.candidate.set(candidate);
    this.conflicts.set(result.conflictFieldIds);
    this.provenance.setPending(candidate);
    this.store.dispatch(GenerationActions.patchApplied({ candidate, conflictFieldIds: result.conflictFieldIds }));
  }

  private async commitAfterSave(targetOid: string): Promise<void> {
    const candidate = this.candidate();
    const session = this.effectiveSession();
    if (!candidate || !session) return;
    this.store.dispatch(GenerationActions.commitStarted());
    const reviewedFieldIds = candidate.items
      .filter((item) => item.reviewRequired && !this.provenance.byPointer()[item.metadataPointer]?.reviewRequired)
      .map((item) => item.fieldId);
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.api.commit(session.runId, { targetOid, candidateDigest: candidate.candidateDigest, reviewedFieldIds });
        this.store.dispatch(GenerationActions.commitFinished());
        await this.provenance.load(targetOid);
        return;
      } catch (error) {
        lastError = error;
        await new Promise<void>((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
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

  private rootPointer(pointer: string): string | null {
    const rootSegment = pointer.split('/').filter(Boolean)[0];
    return rootSegment ? `/${rootSegment}` : null;
  }

  private async maybeLaunchFromSelection(fieldId?: string): Promise<void> {
    const form = this.form();
    const normalizedFieldId = String(fieldId ?? '').split('/').filter(Boolean).at(-1) ?? '';
    const launch = this.launches().find((candidate) => {
      const segments = candidate.sourcePointer.split('/').filter(Boolean);
      return segments[0] === normalizedFieldId || this.pointerFieldId(candidate.sourcePointer) === normalizedFieldId;
    });
    if (!form || !launch || this.effectiveSession() || this.busy()) return;
    const sourceOid = this.readPointer(form.getRawValue(), launch.sourcePointer);
    if (typeof sourceOid !== 'string' || !sourceOid.trim()) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.api.launch({ bindingKey: launch.bindingKey, sourceOid: sourceOid.trim() });
      const session: GenerationRuntimeSession = {
        runId: result.runId,
        bindingKey: launch.bindingKey,
        autoOpen: true,
        initialValues: [{ metadataPointer: launch.sourcePointer, value: sourceOid.trim() }],
      };
      this.activeSession.set(session);
      if (this.inline()) this.inlineOpen.set(true);
      this.initialisedRunId = session.runId;
      await this.initialise(session, form);
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(false);
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
