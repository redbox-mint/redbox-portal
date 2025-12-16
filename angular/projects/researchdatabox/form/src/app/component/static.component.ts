import {Component, inject, Injector, Input} from '@angular/core';
import {FormFieldBaseComponent, FormFieldModel} from '@researchdatabox/portal-ng-common';
import {FormService} from "../form.service";
import {FormComponent} from "../form.component";
import {
  StaticComponentName,
  StaticFieldComponentConfig,
  FormFieldComponentStatus
} from "@researchdatabox/sails-ng-common";
import * as Handlebars from 'handlebars';

/*
 * *** Migration Notes ***
 * This component may replace legacy components: StaticComponent and HtmlRawComponent.
 * This component allows showing static content.
 * It should be used for static content that is not linked to a record data model value.
 * For showing model data in a read-only component, another component should be used, e.g. ContentComponent.
 *
 * Use Cases:
 * - show value of generated data from server-side in a HTML span
 * - show value of static text/content that is not saved to the server side metadata
 * - set on load / init, if needs to be changed, that's what expressions are for
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
export class StaticComponent extends FormFieldBaseComponent<string> {
  protected override logName: string = StaticComponentName;
  public content:string = '';

  /**
   * The model associated with this component.
   */
  @Input() public override model?: never;

  private injector = inject(Injector);
  private formService = inject(FormService);

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
    const config = this.componentDefinition?.config as StaticFieldComponentConfig;

    const template = config?.template ?? '';
    const extraContext = config?.extraContext ?? '';

    if (extraContext && template) {
      const name = this.name;
      const templateLineagePath = [...(this.formFieldCompMapEntry?.lineagePaths?.formConfig ?? []), 'component', 'config', 'template'];
      try {
        const compiledItems = await this.getFormComponent.getRecordCompiledItems();
        const context = {extraContext: extraContext};
        const extra = {libraries: {Handlebars: Handlebars}};
        this.content = compiledItems.evaluate(templateLineagePath, context, extra);
      } catch (error) {
        this.loggerService.error(`${this.logName}: Error loading content component '${name}' at ${JSON.stringify(templateLineagePath)}`, error);
        this.status.set(FormFieldComponentStatus.ERROR);
        this.content = '';
      }
    } else if (extraContext && !template) {
      this.content = extraContext;
    } else {
      this.content = '';
    }
  }
}
