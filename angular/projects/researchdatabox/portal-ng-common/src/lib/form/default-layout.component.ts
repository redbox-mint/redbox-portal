import { FormFieldBaseComponent, FormFieldCompMapEntry } from './form-field-base.component';
import { FormComponentLayoutDefinition } from './config.model';
import { isEmpty as _isEmpty } from 'lodash-es';
import { Component, ViewChild, ViewContainerRef, TemplateRef } from '@angular/core';
import { FormBaseWrapperComponent } from './base-wrapper.component';
/**
 * Default Form Component Layout
 * 
 * This component provides additional layout-specific functionality for form components. 
 * 
 * The default layout is the following, which based by the legacy form field layout:
 * 
 * <div>
 *   <label>
 *    Label
 *    <span>Required indicator</span>
 *    <button>Help Button</button>
 *  </label>
 *  <span>Help Text</span> 
 *  <ng-container>The component</ng-container>
 * </div>
 *
 * Other layouts can be defined, 
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Component({
  selector: 'redbox-form-default-component-layout',
  template: `
  @if (model && componentDefinition) {
    @if (componentDefinition.config?.label) {
      <label>
        <span [innerHtml]="componentDefinition?.config?.label"></span>
        <span class="form-field-required-indicator" [innerHTML]="componentDefinition?.config?.labelRequiredStr"></span>
        @if (componentDefinition.config?.helpText) {
          <button type="button" class="btn btn-default" (click)="toggleHelpTextVisibility()" [attr.aria-label]="'help' | i18next ">
          <span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span>
          </button>
        }
      </label>
      @if (helpTextVisible) {
        <span class="help-block" [innerHtml]="componentDefinition?.config?.helpText"></span>
      }
    }
    <ng-container #componentContainer>
    </ng-container> 
    <!-- instead of rendering the 'before' and 'after' templates around the componentContainer, we supply named templates so the component can render these as it sees fit -->
    <ng-template #beforeComponentTemplate>
      Before, is help showing:  {{ helpTextVisible }}
    </ng-template>
    <ng-template #afterComponentTemplate>
      After, is help showing:  {{ helpTextVisible }}
    </ng-template>
  }
  `,
  standalone: false,
  // Note: No need for host property here if using @HostBinding
})
export class DefaultLayoutComponent<ValueType> extends FormFieldBaseComponent<ValueType> {
  helpTextVisible: boolean = false;
  componentClass?: typeof FormFieldBaseComponent | null;
  public override componentDefinition?: FormComponentLayoutDefinition;

  @ViewChild('componentContainer', { read: ViewContainerRef, static: false })
  componentContainer!: ViewContainerRef;

  @ViewChild('beforeComponentTemplate', { read: TemplateRef, static: false })
  beforeComponentTemplate!: TemplateRef<any>;
  @ViewChild('afterComponentTemplate', { read: TemplateRef, static: false })
  afterComponentTemplate!: TemplateRef<any>;

  override async initComponent(formFieldCompMapEntry: FormFieldCompMapEntry | null) {
    // TODO: remove the "READY" state setting in the initComponent method 
    await super.initComponent(formFieldCompMapEntry);
    this.componentClass = formFieldCompMapEntry?.componentClass;
    this.componentDefinition = formFieldCompMapEntry?.compConfigJson?.layout as FormComponentLayoutDefinition;

    const childRef = this.componentContainer.createComponent(FormBaseWrapperComponent);
    childRef.instance.componentClass = this.componentClass;
    childRef.instance.model = this.model;
    if (this.formFieldCompMapEntry && this.beforeComponentTemplate && this.afterComponentTemplate) {
      this.formFieldCompMapEntry.componentTemplateRefMap = {
        before: this.beforeComponentTemplate,
        after: this.afterComponentTemplate
      };
    }
    childRef.instance.formFieldCompMapEntry = this.formFieldCompMapEntry;
    childRef.changeDetectorRef.detectChanges();
  }

  ngAfterViewInit() {
    
  }

  toggleHelpTextVisibility() {
   this.helpTextVisible = !this.helpTextVisible;
  }
}