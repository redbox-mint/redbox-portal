import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import {
  emptyRecordSaveCompletion,
  isRecordSaveComplete,
  SaveStatusComponentName,
  SaveStatusFieldComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import { filter, merge } from 'rxjs';
import { FormComponentEventBus, FormComponentEventType, FormSaveFailureEvent, FormSaveSuccessEvent, FormStateFacade } from '../form-state';

type SaveStatusMessageType =
  | 'saving'
  | 'deleting'
  | 'error'
  | 'server-sync-review'
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
      } @else if (messageType() === 'unknown') {
        <div class="rb-form-save-status alert alert-warning" role="alert" aria-atomic="true">
          {{ unknownMessage() | i18next: { requestId: saveDiagnostics().requestId } }}
        </div>
      } @else if (messageType() === 'success') {
        <div class="rb-form-save-status alert alert-success" role="status" aria-live="polite" aria-atomic="true">
          {{ successMessage() | i18next }}
        </div>
      }
      @if (saveDiagnostics().processingIncomplete) {
        <div class="rb-form-save-status alert alert-warning" role="alert" aria-atomic="true">
          {{ warningMessage() | i18next: { requestId: saveDiagnostics().requestId } }}
        </div>
      }
      @if (saveDiagnostics().hasSchemaWarning) {
        <div class="rb-form-save-status alert alert-warning" role="alert" aria-atomic="true">
          {{ '@dmpt-form-save-schema-warning' | i18next: { requestId: saveDiagnostics().requestId } }}
        </div>
      }
      @if (saveDiagnostics().advisoryIssues.length > 0) {
        <div class="rb-form-save-status alert alert-info" role="status" aria-live="polite">
          {{ '@dmpt-form-save-advisory' | i18next }}
          <ul>
            @for (issue of saveDiagnostics().advisoryIssues; track $index) {
              <li>{{ issue.message | i18next: issue.params }}</li>
            }
          </ul>
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
  private readonly saveEvent = toSignal(merge(
    this.eventBus.select$(FormComponentEventType.FORM_SAVE_SUCCESS),
    this.eventBus.select$(FormComponentEventType.FORM_SAVE_FAILURE),
  ).pipe(filter(event => this.scopedEvent(event) !== null)), { initialValue: null });
  private readonly messageState = signal<SaveStatusMessageType>(null);
  private readonly lastOperation = signal<'save' | 'delete' | null>(null);
  private readonly lastSaveResult = signal<FormSaveSuccessEvent | FormSaveFailureEvent | null>(null);
  private pendingOperation: 'save' | 'delete' | null = null;
  private lastSubmissionAttempt = this.formStateFacade.submissionAttempt();
  private lastHandledDeleteSuccessAt: number | null = null;
  private lastHandledSavedAt: string | null = null;
  private lastHandledSaveEvent: FormSaveSuccessEvent | FormSaveFailureEvent | null = null;
  private successTimeoutId: number | null = null;

  constructor() {
    super();

    effect((onCleanup) => {
      const lastSavedAt = this.formStateFacade.lastSavedAt();
      const deleteSuccessEvent = this.scopedEvent(this.deleteSuccessEvent());
      const saveEvent = this.saveEvent();
      const submissionAttempt = this.formStateFacade.submissionAttempt();
      const errorMessage = this.formStateFacade.error();
      const isSaving = this.formStateFacade.isSaving();
      const isDeleting = this.formStateFacade.isDeleting();

      if (isSaving || submissionAttempt !== this.lastSubmissionAttempt) {
        this.lastSubmissionAttempt = submissionAttempt;
        this.lastSaveResult.set(null);
        this.lastOperation.set('save');
        this.pendingOperation = 'save';
        this.clearSuccessTimeout();
        this.messageState.set(isSaving ? 'saving' : null);
      }
      if (isSaving) {
        return;
      }

      if (isDeleting) {
        this.lastSaveResult.set(null);
        this.lastOperation.set('delete');
        this.pendingOperation = 'delete';
        this.clearSuccessTimeout();
        this.messageState.set('deleting');
        return;
      }

      if (deleteSuccessEvent && deleteSuccessEvent.timestamp !== this.lastHandledDeleteSuccessAt &&
          this.pendingOperation === 'delete') {
        this.lastHandledDeleteSuccessAt = deleteSuccessEvent.timestamp;
        this.lastOperation.set('delete');
        this.pendingOperation = null;
        this.showSuccessMessage(onCleanup);
        return;
      }

      if (saveEvent && saveEvent !== this.lastHandledSaveEvent) {
        this.lastHandledSaveEvent = saveEvent;
        if (saveEvent.type === FormComponentEventType.FORM_SAVE_FAILURE &&
            (this.pendingOperation === 'save' || saveEvent.formScopeId || saveEvent.kind)) {
          this.lastOperation.set('save');
          this.pendingOperation = null;
          this.lastSaveResult.set(saveEvent);
          this.clearSuccessTimeout();
          this.messageState.set(this.saveFailureMessageType(saveEvent));
          return;
        }

        if (saveEvent.type === FormComponentEventType.FORM_SAVE_SUCCESS && this.pendingOperation === 'save') {
          this.lastHandledSavedAt = lastSavedAt ?? null;
          this.lastOperation.set('save');
          this.pendingOperation = null;
          this.lastSaveResult.set(saveEvent);
          if (saveEvent.response?.outcome === 'saved-with-warnings') {
            this.messageState.set(null);
          } else {
            this.showSuccessMessage(onCleanup);
          }
          return;
        }
      }

      if (errorMessage) {
        const operation = this.pendingOperation;
        if (!operation) {
          return;
        }
        this.lastOperation.set(operation);
        this.pendingOperation = null;
        this.clearSuccessTimeout();
        this.messageState.set('error');
        return;
      }

      if (!lastSavedAt || lastSavedAt === this.lastHandledSavedAt) {
        return;
      }

      if (this.pendingOperation !== 'save') {
        return;
      }
      this.lastHandledSavedAt = lastSavedAt;
      this.lastOperation.set('save');
      this.pendingOperation = null;
      this.showSuccessMessage(onCleanup);
    });
  }

  protected readonly errorMessage = computed(() => this.formStateFacade.error() ?? '');
  protected readonly saveDiagnostics = computed(() => {
    const result = this.lastSaveResult();
    const persisted = result?.type === FormComponentEventType.FORM_SAVE_SUCCESS || result?.kind === 'server-sync-review';
    const response = persisted ? result.response : null;
    const problems = response?.problems ?? [];
    return {
      requestId: result?.requestId ?? result?.response?.requestId ?? '',
      advisoryIssues: problems.flatMap(problem => problem.source === 'advisory' ? problem.issues : []),
      hasSchemaWarning: problems.some(problem => problem.source === 'schema'),
      processingIncomplete: response?.outcome === 'saved-with-warnings' && !isRecordSaveComplete({
        outcome: response.outcome,
        problems,
        completion: response.completion ?? emptyRecordSaveCompletion(),
      }),
    };
  });
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
    const operation = this.lastSaveResult()?.operation;
    return operation === 'create' || (operation === undefined && !this.formComponent?.trimmedParams.oid());
  }

  private configuredMessage(property: SaveStatusMessageConfigProperty, fallback: string): string {
    const configured = this.getStringProperty(property);
    return typeof configured === 'string' && configured.trim() ? configured.trim() : fallback;
  }

  private saveFailureMessageType(event: FormSaveFailureEvent): SaveStatusMessageType {
    if (event.kind === 'server-sync-review') return 'server-sync-review';
    if (event.kind === 'client-validation' && this.componentDefinition?.config?.showClientValidationFailure === false) return null;
    return event.response?.outcome === 'unknown' ? 'unknown' : 'error';
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
