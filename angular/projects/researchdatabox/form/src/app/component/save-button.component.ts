import { Component, inject, effect } from '@angular/core';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import { FormComponent } from '../form.component';
import {SaveButtonComponentName, SaveButtonFieldComponentDefinitionOutline} from '@researchdatabox/sails-ng-common';

@Component({
  selector: 'redbox-form-save-button',
  template:`
  @if (isVisible) {
    <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
    <button type="button" class="btn btn-primary" (click)="save()" [innerHtml]="label" [disabled]="disabled"></button>
    <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
  }
  `,
  standalone: false
})
export class SaveButtonComponent extends FormFieldBaseComponent<undefined> {
  public override logName = SaveButtonComponentName;
  protected override formComponent: FormComponent = inject(FormComponent);
  public override componentDefinition?: SaveButtonFieldComponentDefinitionOutline;
  disabled: boolean = false;

  constructor() {
    super();
    // Monitor form status to update disabled state
    effect(() => {
      const status = this.formComponent.status();
      const dataStatus = this.formComponent.formGroupStatus();
      // Disable if the form is invalid, pristine, or not ready (including VALIDATION_PENDING or SAVING)
      this.disabled = !dataStatus.valid ||
      dataStatus.pristine ||
      status === 'VALIDATION_PENDING' ||
      status === 'SAVING'
    });
  }

  protected override async setComponentReady(): Promise<void> {
    await super.setComponentReady();
  }

  public async save() {
    if (this.formComponent && !this.disabled) {
      await this.formComponent.saveForm(this.componentDefinition?.config?.forceSave, this.componentDefinition?.config?.targetStep, this.componentDefinition?.config?.skipValidation);
    } else {
      this.loggerService.debug(`Save button clicked but form is pristine, currently saving, not valid or dirty`);
    }
  }

}
