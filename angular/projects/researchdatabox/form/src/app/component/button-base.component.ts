import {inject} from "@angular/core";
import {FormFieldBaseComponent, HandlebarsTemplateService} from "@researchdatabox/portal-ng-common";
import {FormComponentEventBus, FormStateFacade} from "../form-state";
import {FormService} from "../form.service";
import {ConfirmationDialogService} from "../confirmation-dialog.service";
import {FormComponent} from "../form.component";
import {handlebarsTemplate} from "@researchdatabox/sails-ng-common";

export abstract class ButtonBaseComponent extends FormFieldBaseComponent<undefined> {
  public override logName = "ButtonBaseComponent";
  protected readonly eventBus = inject(FormComponentEventBus);
  protected readonly formStateFacade = inject(FormStateFacade);
  protected readonly formService = inject(FormService);
  protected readonly confirmationDialogService = inject(ConfirmationDialogService);
  protected readonly handlebarsTemplateService = inject(HandlebarsTemplateService);

  protected abstract fallbackVariantClass: string;

  get buttonCssClasses(): string {
    const configuredClasses = (this.componentDefinition?.config as Record<string, unknown> | undefined)?.['buttonCssClasses'];
    return this.resolveButtonCssClasses(typeof configuredClasses === 'string' ? configuredClasses : undefined, this.fallbackVariantClass);
  }

  protected resolveButtonCssClasses(configured: string | undefined, fallbackVariantClass: string): string {
    const normalized = (configured ?? '').trim().replace(/\s+/g, ' ');
    if (!normalized) {
      return `btn ${fallbackVariantClass}`;
    }
    const classTokens = normalized.split(/\s+/);
    return classTokens.includes('btn') ? normalized : `btn ${normalized}`;
  }

  protected async resolveRedirectLocation(redirectLocation: string): Promise<string | undefined> {
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
      const compiledItems = await this.getFormComponent.getRecordCompiledItems();
      const context = this.getTemplateContext();
      const extra = {libraries: {handlebars: handlebarsTemplate}};
      const rendered = compiledItems.evaluate(templateLineagePath, context, extra);
      const output = String(rendered ?? '').trim();
      return output || redirectLocation;
    } catch (error) {
      this.loggerService.warn(`${this.logName}: Failed to evaluate redirect location template for '${templateLineagePath}'. ` +
        `Falling back to the configured value '${redirectLocation}'.`, error);
      return redirectLocation;
    }
  }

  protected getTemplateContext(): { formData: Record<string, unknown>; branding: string; portal: string; oid: string } {
    const formComp = this.formComponent;
    const form = formComp.form;
    return {
      formData: (form?.getRawValue?.() ?? form?.value ?? {}) as Record<string, unknown>,
      branding: String(formComp.trimmedParams.branding() ?? '').trim(),
      portal: String(formComp.trimmedParams.portal() ?? '').trim(),
      oid: String(formComp.trimmedParams.oid() ?? '').trim(),
    };
  }

  protected get getFormComponent(): FormComponent {
    return this.formComponent;
  }

  protected translate(value?: string): string {
    return this.formService.translate(value);
  }
}
