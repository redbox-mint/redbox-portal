import { Component } from '@angular/core';
import { FieldArrayType } from '@ngx-formly/core';

@Component({
  selector: 'formly-array-type',
  template: `
    <div class="mb-3">
      <legend *ngIf="props.label">{{ props.label }}</legend>
      <p *ngIf="props.description">{{ props.description }}</p>

      <div class="alert alert-danger" role="alert" *ngIf="showError && formControl.errors">
        <formly-validation-message [field]="field"></formly-validation-message>
      </div>

      <div *ngFor="let field of field.fieldGroup; let i = index" class="row align-items-start">
        <formly-field class="col-xs-10" [field]="field"></formly-field>
        <div class="col-xs-2 text-right">
          <button type="button" (click)="remove(i)"
                  class="fa fa-minus-circle btn text-20 pull-right btn-danger" ></button>
        </div>
      </div>

      <div class="row">
      <span class="col-xs-12">
        <button type='button' (click)="add()"
                class="btn btn-primary fa fa-plus-circle btn text-20 pull-right btn-success"></button>
      </span>
      </div>
    </div>
  `,
})
export class ArrayTypeComponent extends FieldArrayType {}
