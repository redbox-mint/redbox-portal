import { ChangeDetectorRef, Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormFieldBaseComponent, FormFieldModel } from "@researchdatabox/portal-ng-common";
import _ from 'lodash';
import { get as _get, set as _set, cloneDeep as _cloneDeep} from 'lodash-es';

export class TextFieldModel extends FormFieldModel<string> {  
}

@Component({
    selector: 'redbox-textfield',
    template: `
      <input type='text' [formControl]="formControl" [hidden]="!isVisible" [attr.disabled]="isDisabled ? 'true' : null" [readonly]="isReadonly" />
      `,
    standalone: false
})
export class TextFieldComponent extends FormFieldBaseComponent<string> implements OnChanges{
  /**
     * The model associated with this component.
     * 
     * @type {FieldModel<any>}
     * @memberof FieldComponent
     */
  @Input() public override model?: TextFieldModel;

  constructor(private cd: ChangeDetectorRef) {
    super();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.loggerService.info('ngOnChanges');
    this.loggerService.info('changes');
    this.loggerService.info(changes);
    if(this.expressionStateChanged) {
      this.initConfig();
      this.cd.detectChanges();
    }
  }
  
}