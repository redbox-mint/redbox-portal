import { AnchorOrButtonComponent } from './field-simple.component';
import { AnchorOrButton } from './field-simple';
export declare class WorkflowStepButton extends AnchorOrButton {
    targetStep: string;
    constructor(options: any, injector: any);
}
export declare class WorkflowStepButtonComponent extends AnchorOrButtonComponent {
    field: WorkflowStepButton;
    gotoTargetStep(event: any): any;
}
