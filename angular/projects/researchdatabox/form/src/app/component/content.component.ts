import {Component, inject, Injector} from '@angular/core';
import {FormFieldBaseComponent} from '@researchdatabox/portal-ng-common';
import {FormService} from "../form.service";
import {FormComponent} from "../form.component";
import {ContentFieldComponentConfigFrame} from "@researchdatabox/sails-ng-common";

// *** Migration Notes ***
// This component will replace legacy components: ContentComponent and HtmlRawComponent
//
// Use Cases:
// - show value of SimpleInputComponent in view mode
// - show value of generated data from server-side in a HTML span
// - show value of static text/content that is not saved to the server side metadata
// - set on load / init, if needs to be changed, that's what expressions are for
//
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
  protected override logName: string = "ContentComponent";
  public content:string = '';

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
    const config = this.componentDefinition?.config as ContentFieldComponentConfigFrame;

    const content = config?.content ?? '';
    const template = config?.template ?? '';

    if (content && template) {
      const formComponentName = this.name;
      const formConfigElement = ['component', 'config', 'template'];
      const compiledFn = await this.getFormComponent.getCompiledItem(formComponentName, formConfigElement);
      const context = {content: content};
      this.content = compiledFn(context);
    } else if (content && !template) {
      this.content = content;
    } else {
      this.content = '';
    }
  }
}
