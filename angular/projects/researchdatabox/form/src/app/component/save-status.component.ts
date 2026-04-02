import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import { SaveStatusComponentName } from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus, FormComponentEventType, FormStateFacade } from '../form-state';

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
          {{ errorPrefix() | i18next }} {{ errorMessage() }}
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
  private readonly messageState = signal<'saving' | 'deleting' | 'error' | 'success' | null>(null);
  private readonly lastOperation = signal<'save' | 'delete' | null>(null);
  private lastHandledDeleteSuccessAt: number | null = null;
  private lastHandledSavedAt: string | null = null;
  private successTimeoutId: number | null = null;

  constructor() {
    super();

    effect((onCleanup) => {
      const lastSavedAt = this.formStateFacade.lastSavedAt();
      const deleteSuccessEvent = this.deleteSuccessEvent();
      const errorMessage = this.formStateFacade.error();
      const isSaving = this.formStateFacade.isSaving();
      const isDeleting = this.formStateFacade.isDeleting();

      if (isSaving) {
        this.lastOperation.set('save');
        this.clearSuccessTimeout();
        this.messageState.set('saving');
        return;
      }

      if (isDeleting) {
        this.lastOperation.set('delete');
        this.clearSuccessTimeout();
        this.messageState.set('deleting');
        return;
      }

      if (errorMessage) {
        this.clearSuccessTimeout();
        this.messageState.set('error');
        return;
      }

      if (deleteSuccessEvent && deleteSuccessEvent.timestamp !== this.lastHandledDeleteSuccessAt) {
        this.lastHandledDeleteSuccessAt = deleteSuccessEvent.timestamp;
        this.lastOperation.set('delete');
        this.showSuccessMessage(onCleanup);
        return;
      }

      if (!lastSavedAt || lastSavedAt === this.lastHandledSavedAt) {
        return;
      }

      this.lastHandledSavedAt = lastSavedAt;
      this.lastOperation.set('save');
      this.showSuccessMessage(onCleanup);
    });
  }

  protected readonly errorMessage = computed(() => this.formStateFacade.error() ?? '');
  protected readonly messageType = computed<'saving' | 'deleting' | 'error' | 'success' | null>(() => this.messageState());
  protected readonly errorPrefix = computed(() => this.lastOperation() === 'delete' ? '@dmpt-form-delete-error' : '@dmpt-form-save-error');
  protected readonly successMessage = computed(() => this.lastOperation() === 'delete' ? '@dmpt-form-delete-success' : '@dmpt-form-save-success');

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
