import { ChangeDetectorRef, Component, Input, NgZone, OnChanges, SimpleChanges } from '@angular/core';
import { FormFieldBaseComponent, FormFieldModel } from "@researchdatabox/portal-ng-common";
import { get as _get, set as _set, cloneDeep as _cloneDeep} from 'lodash-es';

export class TextFieldModel extends FormFieldModel<string> {  
}

@Component({
    selector: 'redbox-textfield',
    template: `
      <input type='text' [formControl]="formControl" [attr.disabled]="isDisabled ? 'true' : null" [attr.readonly]="isReadonly ? 'true' : null" (input)="onInput($event)" />
      <label>isVisible {{ isVisible }}</label>
      @if (isVisible) {
        <redbox-label [message]="formControl.value"></redbox-label>
      }
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
      that.zoneC.run(() => {
        that.cdrC.detectChanges();
        that.expressionStateChanged = false;
      });
    }
  }

  onInput(event: Event): void {
    const inputValue = (event.target as HTMLInputElement).value;
    this.loggerService.info('TextFieldComponent onInput');
    this.loggerService.info(inputValue);
  }
}


@Component({
  selector: 'redbox-label',
  template: `
    <label>{{ message }}</label>
    `,
  standalone: false
})
export class LabelComponent implements OnChanges {
  @Input() message!: string;

  ngOnChanges(changes: SimpleChanges) {
    console.log('LabelComponent ngOnChanges:', changes);
  }
}