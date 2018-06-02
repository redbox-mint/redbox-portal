import { Component } from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { AnchorOrButton } from './field-simple';
import { RecordsService } from './records.service';

export class ActionButton extends FieldBase<string>  {
  targetAction: string;
  recordService: RecordsService;
  submitting: boolean = false;

  constructor(options: any, injector:any) {
    super(options, injector);
    this.targetAction = options['targetAction'] || null;
    this.recordService = this.getFromInjector(RecordsService);
    this.value = options['value'] || null;
  }

  setValue(value:any) {
    this.value = value;
    this.formModel.patchValue(value, {emitEvent: true, emitModelToViewChange:true });
    this.formModel.markAsTouched();
  }
}

// For action buttons
@Component({
  selector: 'action-button',
  template: `
  <div *ngIf="field.editMode">
    <div *ngIf="field.value">Record published to CKAN at <a target="_blank" [attr.href]="field.value">{{ field.value }}</a></div>
    <div *ngIf="!field.value"><button *ngIf="!field.submitting" type="{{field.type}}" [ngClass]="field.cssClasses" (click)="executeAction($event)" [disabled]="isDisabled()">{{field.label}}</button><span *ngIf="field.submitting">Submitting to CKAN</span>
    </div>
    <div [formGroup]='form'>
    <input [formControl]="getFormControl()"  [id]="field.name" name="{{field.name}}" type="hidden" />
    </div>
  </div>
  <div *ngIf="!field.editMode">
    <div *ngIf="field.value">Record published to CKAN at <a target="_blank" [attr.href]="field.value">{{ field.value }}</a></div>
    <div *ngIf="!field.value">Record not yet published</div>
  </div>
  `,
})
export class ActionButtonComponent extends SimpleComponent {
  field: ActionButton;

  executeAction(event:any) {
    this.field.submitting = true;
    let that = this;
    this.field.recordService.executeAction(this.field.targetAction,{oid: this.field.fieldMap._rootComp.oid})
    .then(function (response) {
      that.field.submitting = false;
      that.field.setValue("http://203.101.227.135:5000/dataset/"+that.field.fieldMap._rootComp.oid);
      that.fieldMap._rootComp.onSubmit().subscribe();
    });

  }

  isDisabled() {
    return false;
  }

}
