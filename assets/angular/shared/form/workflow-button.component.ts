import { Component } from '@angular/core';
import { AnchorOrButtonComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { AnchorOrButton } from './field-simple';

export class WorkflowStepButton extends AnchorOrButton {
  targetStep: string;

  constructor(options: any) {
    super(options);
    this.targetStep = options['targetStep'] || null;
  }
}

// For workflow buttons
@Component({
  selector: 'workflowstep-button',
  template: `
  <button type="{{field.type}}" [ngClass]="field.cssClasses" (click)="gotoTargetStep($event)" [disabled]="isDisabled()">{{field.label}}</button>
  `,
})
export class WorkflowStepButtonComponent extends AnchorOrButtonComponent {
  field: WorkflowStepButton;

  gotoTargetStep(event:any) {
    return this.fieldMap._rootComp.stepTo(this.field.targetStep);
  }
}
