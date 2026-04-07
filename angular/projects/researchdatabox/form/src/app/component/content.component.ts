import {Component, inject, Injector, Input} from '@angular/core';
import { Subscription } from "rxjs";
import {FormFieldBaseComponent, HandlebarsTemplateService, TranslationService} from '@researchdatabox/portal-ng-common';
import {FormComponent} from "../form.component";
import {
  ContentComponentName,
  ContentFieldComponentConfig,
  FormFieldComponentStatus,
  guessType
} from "@researchdatabox/sails-ng-common";
import {FormService} from "../form.service";


/*
 * *** Migration Notes ***
 * This component may replace legacy components: ContentComponent and HtmlRawComponent.
 * This component allows showing static content or a model value in a read-only way.
 *
 * The 'template' is intended for *very* simple display formatting using Handlebars.
 * If the template becomes more than one or two elements or handlebars directives,
 * then it likely should be a dedicated component instead of a template.
 *
 * There are a number of default component transforms from other components into this component in view-only mode.
 * See 'defaultTransforms in 'sails-ng-common/src/config/form-override.model.ts'.
 *
 * There is no data binding in the ContentComponent.
 * If you find you need to change the value of the ContentComponent, either:
 * - use an expression to change the 'content' to some other static content
 * - use a different component that caters for what you want to do
 *
 * Use Cases:
 * - show value of an editable component (e.g. SimpleInputComponent) in view mode
 * - show a static content value
 */


@Component({
  selector: 'redbox-content',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <span [innerHtml]="content"></span>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false
})
export class ContentComponent extends FormFieldBaseComponent<string> {
  protected override logName: string = ContentComponentName;
  public content:string = '';
  private formValueChangesSub?: Subscription;
  private formBindTimeoutId?: ReturnType<typeof setTimeout>;

  /**
   * The model associated with this component.
   */
  @Input() public override model?: never;

  private handlebarsTemplateService = inject(HandlebarsTemplateService);
  private translationService = inject(TranslationService);
  private formService = inject(FormService);

  private get getFormComponent(): FormComponent {
    return this.formComponent;
  }

  protected override async initData(): Promise<void> {
    const config = this.componentDefinition?.config as ContentFieldComponentConfig;

    const template = config?.template ?? '';
    const content = config?.content ?? '';
    const contentIsTranslationCode = (config as { contentIsTranslationCode?: boolean } | undefined)?.contentIsTranslationCode === true;

    if (content && template) {
      // If there is both a content and template, retrieve the template and provide the content as context.
      const name = this.name;
      const templateLineagePath = [...(this.formFieldCompMapEntry?.lineagePaths?.formConfig ?? []), 'component', 'config', 'template'];
      try {
        // Build the variables available to the template.
        const context = {content: content, translationService: this.translationService};
        const extra = {libraries: this.handlebarsTemplateService.getLibraries()};
        const compiledItems = await this.getFormComponent.getRecordCompiledItems();
        const renderTemplate = (formData: Record<string, unknown> = {}) => {
          const runtimeContext = this.getRuntimeTemplateContext();
          // Build the variables available to the template.
          const context = {
            content: content,
            formData: formData,
            translationService: this.translationService,
            branding: runtimeContext.branding,
            portal: runtimeContext.portal,
            oid: runtimeContext.oid
          };
          const extra = {libraries: this.handlebarsTemplateService.getLibraries()};
          this.content = compiledItems.evaluate(templateLineagePath, context, extra);
        };
        const initialForm = this.getFormComponent.form;
        renderTemplate(initialForm?.getRawValue?.() ?? initialForm?.value ?? {});

        const bindRenderToForm = (attempt = 0) => {
          const maxAttempts = 100;
          const form = this.getFormComponent.form;
          if (!form) {
            if (attempt < maxAttempts) {
              this.formBindTimeoutId = setTimeout(() => bindRenderToForm(attempt + 1), 50);
            }
            return;
          }

          // Build the variables available to the template.
          renderTemplate(form.getRawValue?.() ?? form.value ?? {});
          this.formValueChangesSub?.unsubscribe();
          this.formValueChangesSub = form.valueChanges.subscribe(() => renderTemplate(form.getRawValue?.() ?? form.value ?? {}));
        };

        bindRenderToForm();
        this.loggerService.debug(`${this.logName}: Set content component '${name}' at ${JSON.stringify(templateLineagePath)} from handlebars template ${JSON.stringify({content, template})}`);
      } catch (error) {
        this.loggerService.error(`${this.logName}: Error loading content component '${name}' at ${JSON.stringify(templateLineagePath)}`, error);
        this.status.set(FormFieldComponentStatus.ERROR);
        this.content = '';
      }
    } else if (content && !template && guessType(content) === "string") {
      // If there is content and no template, and the content is a string, display the content.
      this.content = contentIsTranslationCode ? this.translate(content as string) : content as string;
    } else {
      // If no content or template, display a blank string.
      this.content = '';
    }
  }

  private translate(value: string): string {
    return this.formService.translate(value);
  }

  private getRuntimeTemplateContext(): { branding: string; portal: string; oid: string } {
    const oid = String(this.getFormComponent.trimmedParams.oid() ?? '').trim();
    const branding = String(this.getFormComponent.trimmedParams.branding() ?? '').trim();
    const portal = String(this.getFormComponent.trimmedParams.portal() ?? '').trim();
    return { branding, portal, oid };
  }

  ngOnDestroy(): void {
    if (this.formBindTimeoutId) {
      clearTimeout(this.formBindTimeoutId);
    }
    this.formValueChangesSub?.unsubscribe();
  }
}
