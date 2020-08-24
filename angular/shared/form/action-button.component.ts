import * as _ from "lodash";
import { Component } from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { AnchorOrButton } from './field-simple';
import { RecordsService, RecordActionResult } from './records.service';

export class ActionButton extends FieldBase<string>  {
  targetAction: string;
  recordService: RecordsService;
  submitting: boolean = false;
  valueLabelPrefix: string;
  valueLabelSufffix: string;
  valueIsUrl: boolean;
  submittingLabel: string;
  unsubmittedLabel: string;
  isDisabledTemplate: string;
  isRecordAction: boolean;

  constructor(options: any, injector:any) {
    super(options, injector);
    this.targetAction = options['targetAction'] || null;
    this.recordService = this.getFromInjector(RecordsService);
    this.value = options['value'] || null;
    // read from the form config if this action button should be part of the form (i.e. hold values)
    this.hasControl = _.isUndefined(options['hasControl']) ? this.hasControl : options['hasControl'];
    // controls if the action button will be disabled
    this.isDisabledTemplate = options['isDisabledTemplate'];
    this.valueLabelPrefix = _.isUndefined(options['valueLabelPrefix']) ? this.getTranslated(options['valueLabelPrefix'], '') : '';
    this.valueLabelSufffix = _.isUndefined(options['valueLabelSufffix']) ? this.getTranslated(options['valueLabelSufffix'], '') : '';
    this.submittingLabel = _.isUndefined(options['submittingLabel']) ? this.getTranslated(options['submittingLabel'], '') : '';
    this.unsubmittedLabel = _.isUndefined(options['unsubmittedLabel']) ? this.getTranslated(options['unsubmittedLabel'], '') : '';
    this.valueIsUrl = _.isUndefined(options['valueIsUrl']) ? true : options['valueIsUrl'];
    this.isDisabledTemplate = options['isDisabledTemplate'];
    this.isRecordAction = _.isUndefined(options['isRecordAction']) ? false : options['isRecordAction'];

  }

  setValue(value:any) {
    this.value = value;
    this.formModel.patchValue(value, {emitEvent: true, emitModelToViewChange:true });
    this.formModel.markAsTouched();
  }

  // override the default behavior to prevent form control creation
  public getGroup(group: any, fieldMap: any): any {
    this.fieldMap = fieldMap;
    let retval = null;
    if (this.hasControl) {
      return super.getGroup(group, fieldMap);
    }
    return retval;
  }
}

// For action buttons
@Component({
  selector: 'action-button',
  template: `
  <ng-container *ngIf="field.editMode && field.visible">
    <div *ngIf="field.value">
      {{ field.valueLabelPrefix }}<a *ngIf="field.valueIsUrl" target="_blank" [attr.href]="field.value">{{ field.value }}</a>{{ field.valueLabelSuffix }}
    </div>
    <div *ngIf="!field.value">
      <button *ngIf="!field.submitting" type="{{field.type}}" [ngClass]="field.cssClasses" (click)="executeAction($event)" [disabled]="isDisabled()">
        {{field.label}}
      </button>
      <span *ngIf="field.submitting && field.submittingLabel">{{ field.submittingLabel }}</span>
    </div>
    <div *ngIf="field.hasControl" [formGroup]='form'>
      <input [formControl]="getFormControl()"  [id]="field.name" name="{{field.name}}" type="hidden" />
    </div>
  </ng-container>
  <div *ngIf="!field.editMode && field.visible">
    <div *ngIf="field.value">
    {{ field.valueLabelPrefix }}<a *ngIf="field.valueIsUrl" target="_blank" [attr.href]="field.value">{{ field.value }}</a>{{ field.valueLabelSuffix }}
    </div>
    <div *ngIf="!field.value && field.unsubmittedLabel">{{ field.unsubmittedLabel }}</div>
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
      if (that.field.isRecordAction) {
        response = response as RecordActionResult;
        if (response.success == true) {
          // execute success action

        } else {
          // show the failure message

        }
      } else {
        // parsing of the response will be delegated to form configuration

      }
      // decide later what to do with CKAN-specific behavior
      // that.field.setValue("http://203.101.227.135:5000/dataset/"+that.field.fieldMap._rootComp.oid);
      // that.fieldMap._rootComp.onSubmit().subscribe();
    });
  }

  isDisabled() {
    if (_.isEmpty(this.field.isDisabledTemplate)) {
      return false;
    }
    const imports = _.extend({}, this);
    const templateData = {imports: imports};
    const template = _.template(this.field.isDisabledTemplate, templateData);
    const templateRes = template();
    return templateRes;
  }

}
