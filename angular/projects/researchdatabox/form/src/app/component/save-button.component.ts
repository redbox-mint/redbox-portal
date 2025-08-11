import { Component, inject } from '@angular/core';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import { FormComponent } from '../form.component';

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
  
  protected override async setComponentReady(): Promise<void> {
    await super.setComponentReady(); 
    this.formComponent = this.getFormComponentFromAppRef();
  }

  public async save() {
    await this.formComponent.saveForm();
  }

  get disabled(): boolean { 
    // Check if the `formComponent.formGroup` is valid and dirty
    return !this.formComponent?.dataStatus.valid || !this.formComponent?.dataStatus.dirty;   
  }
}