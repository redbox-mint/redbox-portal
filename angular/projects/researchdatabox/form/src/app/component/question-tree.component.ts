import {FormFieldBaseComponent, FormFieldModel} from "@researchdatabox/portal-ng-common";
import {QuestionTreeModelValueType, QuestionTreeComponentName} from "@researchdatabox/sails-ng-common";
import {Component, Input} from "@angular/core";


export class QuestionTreeModel extends FormFieldModel<QuestionTreeModelValueType> {

}

@Component({
  selector: 'redbox-questiontreefield',
  template: `
    <ng-container *ngTemplateOutlet="getTemplateRef('before')"/>
    <ng-container #componentContainer/>
    <ng-container *ngTemplateOutlet="getTemplateRef('after')"/>
  `,
  standalone: false
})
export class QuestionTreeComponent extends FormFieldBaseComponent<QuestionTreeModelValueType> {
  protected override logName = QuestionTreeComponentName;

  /**
   * The model associated with this component.
   */
  @Input() public override model?: QuestionTreeModel;
}
