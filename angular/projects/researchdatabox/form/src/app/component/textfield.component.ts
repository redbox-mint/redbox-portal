import { ChangeDetectorRef, Component, Input, NgZone, OnChanges, SimpleChanges } from '@angular/core';
import { FormFieldBaseComponent, FormFieldModel } from "@researchdatabox/portal-ng-common";
import _ from 'lodash';
import { get as _get, set as _set, cloneDeep as _cloneDeep} from 'lodash-es';

export class TextFieldModel extends FormFieldModel<string> {  
}

@Component({
    selector: 'redbox-textfield',
    template: `
      <input type='text' [formControl]="formControl" [hidden]="!isVisible" [attr.disabled]="isDisabled ? 'true' : null" [attr.readonly]="isReadonly ? 'true' : null" (input)="onInput($event)" />
      `,
    standalone: false
})
export class TextFieldComponent extends FormFieldBaseComponent<string> implements OnChanges {
  /**
     * The model associated with this component.
     * 
     * @type {FieldModel<any>}
     * @memberof FieldComponent
     */
  @Input() public override model?: TextFieldModel;
  @Input() public override isVisible: boolean = true;

  constructor(private cdrC: ChangeDetectorRef, private zoneC: NgZone) {
    super(cdrC, zoneC);
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.loggerService.info('TextFieldComponent ngOnChanges');
    this.loggerService.info('TextFieldComponent changes');
    this.loggerService.info(changes);
    if(this.expressionStateChanged) {
      let that = this;
      setTimeout(() => {
        that.zoneC.run(() => {
          that.cdrC.detectChanges();
          that.expressionStateChanged = false;
        });
      }, 0);
    }
  }

  onInput(event: Event): void {
    const inputValue = (event.target as HTMLInputElement).value;
    this.loggerService.info(inputValue);
    this.loggerService.info('TextFieldComponent onInput isVisible '+this.isVisible);
  }
  
}