import { Input, Component, ViewChild, ViewContainerRef, OnInit, Injector} from '@angular/core';
import { DateTime } from './field-simple'
import { SimpleComponent } from './field-simple.component';
/**
Wrapped: https://github.com/nkalinov/ng2-datetime
Based on: https://bootstrap-datepicker.readthedocs.io/en/stable/
*/
@Component({
  selector: 'date-time',
  template: `
  <div *ngIf="field.editMode" [formGroup]='form' class="form-group">
    <label [attr.for]="field.name">
      {{field.label}} {{ getRequiredLabelStr()}}
      <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()"><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
    </label><br/>
    <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
    <datetime #dateTime [formControl]="getFormControl()" [timepicker]="field.timePickerOpts" [datepicker]="field.datePickerOpts" [hasClearButton]="field.hasClearButton"></datetime>
  </div>
  <li *ngIf="!field.editMode" class="key-value-pair">
    <span class="key" *ngIf="field.label">{{field.label}}</span>
    <span class="value">{{field.formatValueForDisplay()}}</span>
  </li>
  `
})
export class DateTimeComponent extends SimpleComponent {
  /**
   * The field model
   */
  public field: DateTime; 
  /**
   * Component method that formats the value, delegates to field.
   */
  formatValue() {
    return this.field.formatValue(this.getFormControl().value);
  }

}
