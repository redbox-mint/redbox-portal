import { Component, inject } from '@angular/core';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import { FormComponent } from '../form.component';
import { SaveButtonComponentDefinition } from '@researchdatabox/sails-ng-common';

@Component({
  selector: 'redbox-form-save-button',
  template:`
  @if (getBooleanProperty('visible')) {
    <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
    <button type="button" class="btn btn-primary" (click)="save()" [innerHtml]="getStringProperty('label')" [disabled]="disabled"></button>
    <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
  }
  `,
  standalone: false
})
export class SaveButtonComponent extends FormFieldBaseComponent<undefined> {
  public override logName: string = "SaveButtonComponent";
  protected override formComponent: FormComponent = inject(FormComponent);
  public override componentDefinition?: SaveButtonComponentDefinition;

  protected override async setComponentReady(): Promise<void> {
    await super.setComponentReady(); 
  }

  public async save() {
    if (this.formComponent && !this.disabled) {
      await this.formComponent.saveForm(this.componentDefinition?.config?.forceSave, this.componentDefinition?.config?.targetStep, this.componentDefinition?.config?.skipValidation);
    } else {
      this.loggerService.debug(`Save button clicked but form is not valid or dirty`);
    }
  }

  get disabled(): boolean { 
    // Check if the `formComponent.formGroup` is valid and dirty
    return !this.formComponent?.dataStatus.valid || !this.formComponent?.dataStatus.dirty;   
  }
}