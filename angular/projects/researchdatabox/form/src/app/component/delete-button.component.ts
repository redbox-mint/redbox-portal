import { Component, computed, inject } from '@angular/core';
import { FormFieldBaseComponent, HandlebarsTemplateService } from '@researchdatabox/portal-ng-common';
import { DeleteButtonComponentName, DeleteButtonFieldComponentDefinitionOutline } from '@researchdatabox/sails-ng-common';
import { FormComponent } from '../form.component';
import { ConfirmationDialogService } from '../confirmation-dialog.service';
import { createFormDeleteRequestedEvent, FormComponentEventBus, FormStateFacade } from '../form-state';
import { FormService } from '../form.service';

@Component({
  selector: 'redbox-form-delete-button',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <div class="rb-form-delete-button">
        <button
          type="button"
          [class]="buttonCssClasses"
          (click)="delete()"
          [disabled]="disabled()"
          [innerHtml]="translate(componentDefinition?.config?.label)"
        ></button>
      </div>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false,
})
export class DeleteButtonComponent extends FormFieldBaseComponent<undefined> {
  public override logName = DeleteButtonComponentName;
  protected override formComponent: FormComponent = inject(FormComponent);
  public override componentDefinition?: DeleteButtonFieldComponentDefinitionOutline;
  private readonly eventBus = inject(FormComponentEventBus);
  private readonly formStateFacade = inject(FormStateFacade);
  private readonly formService = inject(FormService);
  private readonly confirmationDialogService = inject(ConfirmationDialogService);
  private readonly handlebarsTemplateService = inject(HandlebarsTemplateService);

  protected readonly disabled = computed(() => {
    const hasOid = !!this.formComponent.oid()?.trim();
    return this.isDisabled || this.formStateFacade.isDeleting() || !hasOid;
  });

  get buttonCssClasses(): string {
    const configuredClasses = (this.componentDefinition?.config as Record<string, unknown> | undefined)?.['buttonCssClasses'];
    return this.resolveButtonCssClasses(typeof configuredClasses === 'string' ? configuredClasses : undefined, 'btn-danger');
  }

  async delete(): Promise<void> {
    if (this.disabled()) {
      return;
    }

    const confirmed = await this.confirmDelete();
    if (!confirmed) {
      return;
    }

    this.eventBus.publish(
      createFormDeleteRequestedEvent({
        closeOnDelete: this.componentDefinition?.config?.closeOnDelete,
        redirectLocation: await this.resolveRedirectLocation(),
        redirectDelaySeconds: this.componentDefinition?.config?.redirectDelaySeconds,
        sourceId: this.name ?? undefined,
      })
    );
  }

  private async resolveRedirectLocation(): Promise<string | undefined> {
    const redirectLocation = String(this.componentDefinition?.config?.redirectLocation ?? '').trim();
    if (!redirectLocation) {
      return undefined;
    }

    const templateLineagePath = [
      ...(this.formFieldCompMapEntry?.lineagePaths?.formConfig ?? []),
      'component',
      'config',
      'redirectLocation',
    ];

    try {
      const compiledItems = await this.formComponent.getRecordCompiledItems();
      const context = this.getTemplateContext();
      const extra = { libraries: this.handlebarsTemplateService.getLibraries() };
      const rendered = compiledItems.evaluate(templateLineagePath, context, extra);
      const output = String(rendered ?? '').trim();
      return output || redirectLocation;
    } catch (error) {
      this.loggerService.warn(`${this.logName}: Failed to evaluate delete redirect template. Falling back to the configured value.`, error);
      return redirectLocation;
    }
  }

  private getTemplateContext(): { formData: Record<string, unknown>; branding: string; portal: string; oid: string } {
    const form = this.formComponent.form;
    return {
      formData: (form?.getRawValue?.() ?? form?.value ?? {}) as Record<string, unknown>,
      branding: String(this.formComponent.trimmedParams.branding() ?? '').trim(),
      portal: String(this.formComponent.trimmedParams.portal() ?? '').trim(),
      oid: String(this.formComponent.trimmedParams.oid() ?? '').trim(),
    };
  }

  private async confirmDelete(): Promise<boolean> {
    const confirmationMessage = this.componentDefinition?.config?.confirmationMessage?.trim();
    if (!confirmationMessage) {
      return true;
    }

    return this.confirmationDialogService.confirm({
      title: this.componentDefinition?.config?.confirmationTitle,
      message: confirmationMessage,
      confirmLabel: this.componentDefinition?.config?.confirmButtonMessage,
      cancelLabel: this.componentDefinition?.config?.cancelButtonMessage,
      confirmButtonClass: this.resolveButtonCssClasses(this.buttonCssClasses, 'btn-danger'),
    });
  }

  private resolveButtonCssClasses(configured: string | undefined, fallbackVariantClass: string): string {
    const normalized = (configured ?? '').trim().replace(/\s+/g, ' ');
    if (!normalized) {
      return `btn ${fallbackVariantClass}`;
    }
    const classTokens = normalized.split(/\s+/);
    return classTokens.includes('btn') ? normalized : `btn ${normalized}`;
  }

  protected translate(value?: string): string {
    return this.formService.translate(value);
  }
}
