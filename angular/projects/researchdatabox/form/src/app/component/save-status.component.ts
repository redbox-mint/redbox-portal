import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import {
  emptyRecordSaveCompletion,
  isRecordSaveComplete,
  isRecordSaveOutcome,
  RecordSaveOutcome,
  RecordSaveIssue,
  SaveStatusComponentName,
  SaveStatusFieldComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus, FormComponentEventType, FormSaveFailureEvent, FormSaveSuccessEvent, FormStateFacade } from '../form-state';

type SaveStatusMessageType =
  | 'saving'
  | 'deleting'
  | 'error'
  | 'server-sync-review'
  | 'warning'
  | 'schema-warning'
  | 'unknown'
  | 'success'
  | null;
type SaveStatusMessageConfigProperty =
  | 'warningMessageCreate'
  | 'warningMessageUpdate'
  | 'unknownMessageCreate'
  | 'unknownMessageUpdate';

@Component({
  selector: 'redbox-form-save-status',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      @if (messageType() === 'saving') {
        <div class="rb-form-save-status alert alert-info" role="status" aria-live="polite" aria-atomic="true">
          {{ '@dmpt-form-saving' | i18next }} <i class="fa fa-spinner fa-pulse fa-fw" aria-hidden="true"></i>
        </div>
      } @else if (messageType() === 'deleting') {
        <div class="rb-form-save-status alert alert-info" role="status" aria-live="polite" aria-atomic="true">
          {{ '@dmpt-form-deleting' | i18next }} <i class="fa fa-spinner fa-pulse fa-fw" aria-hidden="true"></i>
        </div>
      } @else if (messageType() === 'error' || messageType() === 'server-sync-review') {
        <div class="rb-form-save-status alert alert-danger" role="alert" aria-atomic="true">
          @if (errorPrefix(); as prefix) {
            {{ prefix | i18next }}
          }
          {{ errorMessage() | i18next }}
        </div>
      } @else if (messageType() === 'warning') {
        <div class="rb-form-save-status alert alert-warning" role="alert" aria-atomic="true">
          {{ warningMessage() | i18next: { requestId: requestId() } }}
        </div>
      } @else if (messageType() === 'schema-warning') {
        <div class="rb-form-save-status alert alert-warning" role="alert" aria-atomic="true">
          {{ '@dmpt-form-save-schema-warning' | i18next: { requestId: requestId() } }}
        </div>
      } @else if (messageType() === 'unknown') {
        <div class="rb-form-save-status alert alert-warning" role="alert" aria-atomic="true">
          {{ unknownMessage() | i18next: { requestId: requestId() } }}
        </div>
      } @else if (messageType() === 'success') {
        <div class="rb-form-save-status alert alert-success" role="status" aria-live="polite" aria-atomic="true">
          {{ successMessage() | i18next }}
        </div>
      }
      @if (advisoryIssues().length > 0) {
        <div class="rb-form-save-status alert alert-info" role="status" aria-live="polite">
          {{ '@dmpt-form-save-advisory' | i18next }}
          <ul>
            @for (issue of advisoryIssues(); track $index) {
              <li>{{ issue.message | i18next: issue.params }}</li>
            }
          </ul>
        </div>
      }
      @if (hasSchemaProblems() && (messageType() === 'warning' || messageType() === 'server-sync-review')) {
        <div class="rb-form-save-status alert alert-warning" role="alert" aria-atomic="true">
          {{ '@dmpt-form-save-schema-warning' | i18next: { requestId: requestId() } }}
        </div>
      }
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false
})
export class SaveStatusComponent extends FormFieldBaseComponent<undefined> {
  private static readonly defaultSuccessDisplayDurationMs = 3000;

  public override logName = SaveStatusComponentName;
  public override componentDefinition?: SaveStatusFieldComponentDefinitionOutline;
  protected readonly formStateFacade = inject(FormStateFacade);
  private readonly eventBus = inject(FormComponentEventBus);
  private readonly deleteSuccessEvent = this.eventBus.selectSignal(FormComponentEventType.FORM_DELETE_SUCCESS);
  private readonly saveSuccessEvent = this.eventBus.selectSignal(FormComponentEventType.FORM_SAVE_SUCCESS);
  private readonly saveFailureEvent = this.eventBus.selectSignal(FormComponentEventType.FORM_SAVE_FAILURE);
  private readonly messageState = signal<SaveStatusMessageType>(null);
  protected readonly advisoryIssues = signal<RecordSaveIssue[]>([]);
  protected readonly hasSchemaProblems = signal(false);
  private readonly lastOperation = signal<'save' | 'delete' | null>(null);
  private readonly saveOperation = signal<'create' | 'update' | null>(null);
  private readonly pendingOperation = signal<'save' | 'delete' | null>(null);
  protected readonly requestId = signal<string>('');
  private lastHandledDeleteSuccessAt: number | null = null;
  private lastHandledSavedAt: string | null = null;
  private lastHandledSaveSuccessAt: number | null = null;
  private lastHandledSaveFailure: FormSaveFailureEvent | null = null;
  private successTimeoutId: number | null = null;

  constructor() {
    super();

    effect((onCleanup) => {
      const lastSavedAt = this.formStateFacade.lastSavedAt();
      const deleteSuccessEvent = this.scopedEvent(this.deleteSuccessEvent());
      const saveSuccessEvent = this.scopedEvent(this.saveSuccessEvent());
      const saveFailureEvent = this.scopedEvent(this.saveFailureEvent());
      const errorMessage = this.formStateFacade.error();
      const isSaving = this.formStateFacade.isSaving();
      const isDeleting = this.formStateFacade.isDeleting();

      if (isSaving) {
        this.advisoryIssues.set([]);
        this.hasSchemaProblems.set(false);
        this.lastOperation.set('save');
        this.pendingOperation.set('save');
        this.clearSuccessTimeout();
        this.messageState.set('saving');
        return;
      }

      if (isDeleting) {
        this.advisoryIssues.set([]);
        this.lastOperation.set('delete');
        this.pendingOperation.set('delete');
        this.clearSuccessTimeout();
        this.messageState.set('deleting');
        return;
      }

      // Client validation can finish before saving is observed, and sync review can follow save success.
      if (saveFailureEvent && saveFailureEvent !== this.lastHandledSaveFailure &&
          (saveFailureEvent.kind === 'client-validation' || saveFailureEvent.kind === 'server-sync-review')) {
        this.lastHandledSaveFailure = saveFailureEvent;
        this.lastOperation.set('save');
        this.pendingOperation.set(null);
        this.clearSuccessTimeout();
        if (saveFailureEvent.kind === 'server-sync-review') {
          this.updateSaveDiagnostics(saveFailureEvent);
          this.messageState.set('server-sync-review');
        } else {
          this.advisoryIssues.set([]);
          this.hasSchemaProblems.set(false);
          this.messageState.set(this.componentDefinition?.config?.showClientValidationFailure === false ? null : 'error');
        }
        return;
      }

      if (deleteSuccessEvent && deleteSuccessEvent.timestamp !== this.lastHandledDeleteSuccessAt) {
        if (this.pendingOperation() !== 'delete') {
          return;
        }
        this.lastHandledDeleteSuccessAt = deleteSuccessEvent.timestamp;
        this.lastOperation.set('delete');
        this.pendingOperation.set(null);
        this.showSuccessMessage(onCleanup);
        return;
      }

      if (saveSuccessEvent && saveSuccessEvent.timestamp !== this.lastHandledSaveSuccessAt) {
        if (this.pendingOperation() !== 'save') {
          return;
        }
        this.lastHandledSaveSuccessAt = saveSuccessEvent.timestamp;
        this.lastOperation.set('save');
        this.pendingOperation.set(null);
        const outcome = this.saveOutcome(saveSuccessEvent.response);
        const schemaProblems = this.updateSaveDiagnostics(saveSuccessEvent);
        this.saveOperation.set(saveSuccessEvent.operation ?? null);
        if (outcome === 'saved-with-warnings') {
          this.clearSuccessTimeout();
          const complete = saveSuccessEvent.response &&
            isRecordSaveComplete({
              outcome,
              problems: saveSuccessEvent.response.problems ?? [],
              completion: saveSuccessEvent.response.completion ?? emptyRecordSaveCompletion(),
            });
          this.messageState.set(schemaProblems && complete ? 'schema-warning' : 'warning');
        } else {
          this.showSuccessMessage(onCleanup);
        }
        return;
      }

      if (saveFailureEvent && saveFailureEvent !== this.lastHandledSaveFailure) {
        if (this.pendingOperation() !== 'save') {
          return;
        }
        this.lastHandledSaveFailure = saveFailureEvent;
        const outcome = this.saveOutcome(saveFailureEvent.response);
        this.saveOperation.set(saveFailureEvent.operation ?? null);
        this.requestId.set(saveFailureEvent.requestId ?? saveFailureEvent.response?.requestId ?? '');
        if (outcome === 'unknown') {
          this.lastOperation.set('save');
          this.pendingOperation.set(null);
          this.clearSuccessTimeout();
          this.messageState.set('unknown');
          return;
        }
      }

      if (errorMessage) {
        const operation = this.pendingOperation();
        if (!operation) {
          return;
        }
        this.lastOperation.set(operation);
        this.pendingOperation.set(null);
        this.clearSuccessTimeout();
        this.messageState.set('error');
        return;
      }

      if (!lastSavedAt || lastSavedAt === this.lastHandledSavedAt) {
        return;
      }

      if (this.pendingOperation() !== 'save') {
        return;
      }
      this.lastHandledSavedAt = lastSavedAt;
      this.lastOperation.set('save');
      this.pendingOperation.set(null);
      this.showSuccessMessage(onCleanup);
    });
  }

  protected readonly errorMessage = computed(() => this.formStateFacade.error() ?? '');
  protected readonly messageType = computed<SaveStatusMessageType>(() => {
    const state = this.messageState();
    return (state === 'error' || state === 'server-sync-review') && !this.errorMessage() ? null : state;
  });
  protected readonly errorPrefix = computed(() => {
    if (this.lastOperation() === 'delete') return '@dmpt-form-delete-error';
    const message = this.errorMessage();
    if (message === '@record-save-record-validation-timeout' || message === '@form-server-sync-review-message') return null;
    return '@dmpt-form-save-error';
  });
  protected readonly successMessage = computed(() => this.lastOperation() === 'delete' ? '@dmpt-form-delete-success' : '@dmpt-form-save-success');
  protected readonly warningMessage = computed(() => {
    const isCreate = this.isCreateSave();
    return this.configuredMessage(
      isCreate ? 'warningMessageCreate' : 'warningMessageUpdate',
      isCreate ? '@dmpt-form-save-warning-create' : '@dmpt-form-save-warning-update'
    );
  });
  protected readonly unknownMessage = computed(() => {
    const isCreate = this.isCreateSave();
    return this.configuredMessage(
      isCreate ? 'unknownMessageCreate' : 'unknownMessageUpdate',
      isCreate ? '@dmpt-form-save-unknown-create' : '@dmpt-form-save-unknown-update'
    );
  });

  private isCreateSave(): boolean {
    const operation = this.saveOperation();
    return operation === 'create' || (operation === null && !this.formComponent?.trimmedParams.oid());
  }

  private configuredMessage(property: SaveStatusMessageConfigProperty, fallback: string): string {
    const configured = this.getStringProperty(property);
    return typeof configured === 'string' && configured.trim() ? configured.trim() : fallback;
  }

  private saveOutcome(response: { outcome?: unknown } | null | undefined): RecordSaveOutcome | undefined {
    return isRecordSaveOutcome(response?.outcome) ? response.outcome : undefined;
  }

  private updateSaveDiagnostics({ response, requestId }: FormSaveSuccessEvent | FormSaveFailureEvent): boolean {
    const problems = response?.problems ?? [];
    this.advisoryIssues.set(problems.flatMap(problem => problem.source === 'advisory' ? problem.issues : []));
    const schemaProblems = problems.some(problem => problem.source === 'schema');
    this.hasSchemaProblems.set(schemaProblems);
    this.requestId.set(requestId ?? response?.requestId ?? '');
    return schemaProblems;
  }

  private scopedEvent<T extends { formScopeId?: string }>(event: T | null): T | null {
    if (!event) {
      return null;
    }
    const scopeId = this.formComponent?.eventScopeId;
    return !event.formScopeId || !scopeId || event.formScopeId === scopeId ? event : null;
  }

  private get successDisplayDurationMs(): number {
    const configuredDuration = this.componentDefinition?.config?.successDisplayDurationMs;
    if (typeof configuredDuration === 'number' && Number.isFinite(configuredDuration) && configuredDuration >= 0) {
      return configuredDuration;
    }
    return SaveStatusComponent.defaultSuccessDisplayDurationMs;
  }

  private clearSuccessTimeout(): void {
    if (this.successTimeoutId !== null) {
      window.clearTimeout(this.successTimeoutId);
      this.successTimeoutId = null;
    }
  }

  private showSuccessMessage(onCleanup: (cleanupFn: () => void) => void): void {
    this.clearSuccessTimeout();
    this.messageState.set('success');
    this.successTimeoutId = window.setTimeout(() => {
      this.messageState.set(null);
      this.successTimeoutId = null;
    }, this.successDisplayDurationMs);

    onCleanup(() => this.clearSuccessTimeout());
  }
}
