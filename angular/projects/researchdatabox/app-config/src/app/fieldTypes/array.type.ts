import { Component } from '@angular/core';
import { FieldArrayType } from '@ngx-formly/core';

@Component({
    selector: 'formly-array-type',
    template: `
    <div class="mb-3">
      @if (props.label) {
        <legend>{{ props.label }}</legend>
      }
      @if (props.description) {
        <p>{{ props.description }}</p>
      }
    
      @if (showError && formControl.errors) {
        <div class="alert alert-danger" role="alert">
          <formly-validation-message [field]="field"></formly-validation-message>
        </div>
      }
    
      @for (field of field.fieldGroup; track field; let i = $index) {
        <div class="row align-items-start">
          <formly-field class="col-xs-10" [field]="field"></formly-field>
          <div class="col-xs-2 text-right">
            <button type="button" (click)="remove(i)"
            class="fa fa-minus-circle btn text-20 pull-right btn-danger" ></button>
          </div>
        </div>
      }
    
      <div class="row">
        <span class="col-xs-12">
          <button type='button' (click)="add()"
          class="btn btn-primary fa fa-plus-circle btn text-20 pull-right btn-success"></button>
        </span>
      </div>
    </div>
    `,
    standalone: false
})
export class ArrayTypeComponent extends FieldArrayType {}
