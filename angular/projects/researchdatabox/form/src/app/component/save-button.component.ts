import {FormFieldBaseComponent, FormFieldModel} from "@researchdatabox/portal-ng-common";
import {Component} from "@angular/core";

export class SaveButtonModel extends FormFieldModel<string> {
}

@Component({
  selector: 'redbox-savebutton',
  template: `
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
  `,
  standalone: false
})
export class SaveButtonComponent extends FormFieldBaseComponent<string> {

}
