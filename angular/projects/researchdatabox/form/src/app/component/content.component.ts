import {cloneDeep as _cloneDeep, set as _set} from "lodash";
import {Component, inject, Injector, Input} from '@angular/core';
import {FormFieldBaseComponent, HandlebarsTemplateService, TranslationService} from '@researchdatabox/portal-ng-common';
import {FormComponent} from "../form.component";
import {
  ContentComponentName,
  ContentFieldComponentConfig,
  FormFieldComponentStatus,
  guessType
} from "@researchdatabox/sails-ng-common";


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

  /**
   * The model associated with this component.
   */
  @Input() public override model?: never;

  private injector = inject(Injector);
  private handlebarsTemplateService = inject(HandlebarsTemplateService);
  private translationService = inject(TranslationService);

  private get getFormComponent(): FormComponent {
    return this.injector.get(FormComponent);
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
        this.content = compiledItems.evaluate(templateLineagePath, context, extra);
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
    const translated = this.translationService.t(value);
    if (translated === undefined || translated === null || translated === '') {
      return value;
    }
    const result = typeof translated === 'string' ? translated : String(translated);
    return result === 'undefined' ? value : result;
  }
}
