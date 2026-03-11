import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import { SaveStatusComponentName } from '@researchdatabox/sails-ng-common';
import { FormStateFacade } from '../form-state';

@Component({
  selector: 'redbox-form-save-status',
  template: `
    @if (messageType() === 'saving') {
      <div class="rb-form-save-status alert alert-info" role="status" aria-live="polite" aria-atomic="true">
        {{ '@dmpt-form-saving' | i18next }} <i class="fa fa-spinner fa-pulse fa-fw" aria-hidden="true"></i>
      </div>
    } @else if (messageType() === 'error') {
      <div class="rb-form-save-status alert alert-danger" role="alert" aria-atomic="true">
        {{ '@dmpt-form-save-error' | i18next }} {{ errorMessage() }}
      </div>
    } @else if (messageType() === 'success') {
      <div class="rb-form-save-status alert alert-success" role="status" aria-live="polite" aria-atomic="true">
        {{ '@dmpt-form-save-success' | i18next }}
      </div>
    }
  `,
  standalone: false
})
export class SaveStatusComponent extends FormFieldBaseComponent<undefined> {
  private static readonly defaultSuccessDisplayDurationMs = 3000;

  public override logName = SaveStatusComponentName;
  protected readonly formStateFacade = inject(FormStateFacade);
  private readonly messageState = signal<'saving' | 'error' | 'success' | null>(null);
  private lastHandledSavedAt: string | null = null;
  private successTimeoutId: number | null = null;

  constructor() {
    super();

    effect((onCleanup) => {
      const lastSavedAt = this.formStateFacade.lastSavedAt();
      const errorMessage = this.formStateFacade.error();
      const isSaving = this.formStateFacade.isSaving();

      if (isSaving) {
        this.clearSuccessTimeout();
        this.messageState.set('saving');
        return;
      }

      if (errorMessage) {
        this.clearSuccessTimeout();
        this.messageState.set('error');
        return;
      }

      if (!lastSavedAt || lastSavedAt === this.lastHandledSavedAt) {
        return;
      }

      this.lastHandledSavedAt = lastSavedAt;
      this.clearSuccessTimeout();
      this.messageState.set('success');
      this.successTimeoutId = window.setTimeout(() => {
        this.messageState.set(null);
        this.successTimeoutId = null;
      }, this.successDisplayDurationMs);

      onCleanup(() => this.clearSuccessTimeout());
    });
  }

  protected readonly errorMessage = computed(() => this.formStateFacade.error() ?? '');
  protected readonly messageType = computed<'saving' | 'error' | 'success' | null>(() => this.messageState());

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
}
