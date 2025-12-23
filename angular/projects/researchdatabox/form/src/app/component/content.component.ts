import {cloneDeep as _cloneDeep, set as _set} from "lodash";
import {Component, inject, Injector, Input} from '@angular/core';
import {FormFieldBaseComponent, HandlebarsTemplateService} from '@researchdatabox/portal-ng-common';
import {FormComponent} from "../form.component";
import {
  ContentComponentName,
  ContentFieldComponentConfig,
  FormFieldComponentStatus
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
 * - show a static
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
  private formService = inject(FormService);
  private handlebarsTemplateService = inject(HandlebarsTemplateService);

  /*
   * The below template is a reference that needs to be taken into account for legacy compatibility
   *
   * <span *ngSwitchCase="'h1'" role="heading" aria-level="1" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
   * <span *ngSwitchCase="'h2'" role="heading" aria-level="2" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
   * <span *ngSwitchCase="'h3'" role="heading" aria-level="3" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
   * <span *ngSwitchCase="'h4'" role="heading" aria-level="4" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
   * <span *ngSwitchCase="'h5'" role="heading" aria-level="5" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
   * <span *ngSwitchCase="'h6'" role="heading" aria-level="6" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
   * <hr *ngSwitchCase="'hr'" [ngClass]="field.cssClasses">
   * <span *ngSwitchCase="'span'" [ngClass]="field.cssClasses">{{field.label == null? '' : field.label + ': '}}{{field.value == null? '' : field.value}}</span>
   * <p *ngSwitchDefault [ngClass]="field.cssClasses" [innerHtml]="field.value == null? '' : field.value"></p>
   */

  private get getFormComponent(): FormComponent {
    return this.injector.get(FormComponent);
  }

  protected override async initData(): Promise<void> {
    const config = this.componentDefinition?.config as ContentFieldComponentConfig;

    const template = config?.template ?? '';
    const value = config?.value ?? '';

    if (value && template) {
      // If there is both a value and template, retrieve the template and provide the value as context.
      const name = this.name;
      const templateLineagePath = [...(this.formFieldCompMapEntry?.lineagePaths?.formConfig ?? []), 'component', 'config', 'template'];
      try {
        // Build the value for the template.
        const formValue = _cloneDeep(this.getFormComponent.form?.value);
        const valuePath = this.formFieldCompMapEntry?.lineagePaths?.dataModel;
        if (valuePath) {
          _set(formValue, valuePath, value);
        }

        // The variables available to the template.
        const context = {value: value, formValue: formValue};
        const extra = {libraries: this.handlebarsTemplateService.getLibraries()};
        const compiledItems = await this.getFormComponent.getRecordCompiledItems();
        this.content = compiledItems.evaluate(templateLineagePath, context, extra);
      } catch (error) {
        this.loggerService.error(`${this.logName}: Error loading content component '${name}' at ${JSON.stringify(templateLineagePath)}`, error);
        this.status.set(FormFieldComponentStatus.ERROR);
        this.content = '';
      }
    } else if (value && !template) {
      // If there is a value and no template, display the value.
      this.content = value;
    } else {
      // If no value or template, display a blank string.
      this.content = '';
    }
  }
}
