import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import { isRecordSaveOutcome, RecordSaveOutcome, SaveStatusComponentName } from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus, FormComponentEventType, FormStateFacade } from '../form-state';

type SaveStatusMessageType = 'saving' | 'deleting' | 'error' | 'warning' | 'unknown' | 'success' | null;

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
      } @else if (messageType() === 'error') {
        <div class="rb-form-save-status alert alert-danger" role="alert" aria-atomic="true">
          {{ errorPrefix() | i18next }} {{ errorMessage() | i18next }}
        </div>
      } @else if (messageType() === 'warning') {
        <div class="rb-form-save-status alert alert-warning" role="alert" aria-atomic="true">
          {{ warningMessage() | i18next: { requestId: requestId() } }}
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
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false
})
export class SaveStatusComponent extends FormFieldBaseComponent<undefined> {
  private static readonly defaultSuccessDisplayDurationMs = 3000;

  public override logName = SaveStatusComponentName;
  protected readonly formStateFacade = inject(FormStateFacade);
  private readonly eventBus = inject(FormComponentEventBus);
  private readonly deleteSuccessEvent = this.eventBus.selectSignal(FormComponentEventType.FORM_DELETE_SUCCESS);
  private readonly saveSuccessEvent = this.eventBus.selectSignal(FormComponentEventType.FORM_SAVE_SUCCESS);
  private readonly saveFailureEvent = this.eventBus.selectSignal(FormComponentEventType.FORM_SAVE_FAILURE);
  private readonly messageState = signal<SaveStatusMessageType>(null);
  private readonly lastOperation = signal<'save' | 'delete' | null>(null);
  private readonly saveOperation = signal<'create' | 'update' | null>(null);
  private readonly pendingOperation = signal<'save' | 'delete' | null>(null);
  protected readonly requestId = signal<string>('');
  private lastHandledDeleteSuccessAt: number | null = null;
  private lastHandledSavedAt: string | null = null;
  private lastHandledSaveSuccessAt: number | null = null;
  private lastHandledSaveFailureAt: number | null = null;
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
        this.lastOperation.set('save');
        this.pendingOperation.set('save');
        this.clearSuccessTimeout();
        this.messageState.set('saving');
        return;
      }

      if (isDeleting) {
        this.lastOperation.set('delete');
        this.pendingOperation.set('delete');
        this.clearSuccessTimeout();
        this.messageState.set('deleting');
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
        this.saveOperation.set(saveSuccessEvent.operation ?? null);
        this.requestId.set(saveSuccessEvent.requestId ?? saveSuccessEvent.response?.requestId ?? '');
        if (outcome === 'saved-with-warnings') {
          this.clearSuccessTimeout();
          this.messageState.set('warning');
        } else {
          this.showSuccessMessage(onCleanup);
        }
        return;
      }

      if (saveFailureEvent && saveFailureEvent.timestamp !== this.lastHandledSaveFailureAt) {
        if (this.pendingOperation() !== 'save') {
          return;
        }
        this.lastHandledSaveFailureAt = saveFailureEvent.timestamp;
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
  protected readonly messageType = computed<SaveStatusMessageType>(() => this.messageState());
  protected readonly errorPrefix = computed(() => this.lastOperation() === 'delete' ? '@dmpt-form-delete-error' : '@dmpt-form-save-error');
  protected readonly successMessage = computed(() => this.lastOperation() === 'delete' ? '@dmpt-form-delete-success' : '@dmpt-form-save-success');
  protected readonly warningMessage = computed(() => this.isCreateSave()
    ? '@dmpt-form-save-warning-create'
    : '@dmpt-form-save-warning-update');
  protected readonly unknownMessage = computed(() => this.isCreateSave()
    ? '@dmpt-form-save-unknown-create'
    : '@dmpt-form-save-unknown-update');

  private isCreateSave(): boolean {
    const operation = this.saveOperation();
    return operation === 'create' || (operation === null && !this.formComponent?.trimmedParams.oid());
  }

  private saveOutcome(response: { outcome?: unknown } | null | undefined): RecordSaveOutcome | undefined {
    return isRecordSaveOutcome(response?.outcome) ? response.outcome : undefined;
  }

  private scopedEvent<T extends { formScopeId?: string }>(event: T | null): T | null {
    if (!event) {
      return null;
    }
    const scopeId = this.formComponent?.eventScopeId;
    return !event.formScopeId || !scopeId || event.formScopeId === scopeId ? event : null;
  }

  private get successDisplayDurationMs(): number {
    const configuredDuration = (this.componentDefinition?.config as Record<string, unknown> | undefined)?.['successDisplayDurationMs'];
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
