import { ChangeDetectorRef, Component, inject, Input, NgZone, OnChanges, SimpleChanges } from '@angular/core';
import { FormFieldBaseComponent, FormFieldModel, LoggerService } from "@researchdatabox/portal-ng-common";
import { get as _get, set as _set, isUndefined as _isUndefined, cloneDeep as _cloneDeep} from 'lodash-es';

export class TextFieldModel extends FormFieldModel<string> {  
}

@Component({
    selector: 'redbox-textfield',
    template: `
      @if (isVisible) {
        <input type='text' [formControl]="formControl" [attr.disabled]="isDisabled ? 'true' : null" [attr.readonly]="isReadonly ? 'true' : null" />
        <label>isVisible {{ isVisible }} expressionStateChanged {{ expressionStateChanged }}</label>
      }
      <redbox-label [message]="formControl.value" [expressionStateChanged]="expressionStateChanged"></redbox-label>
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
  @Input() public override expressionStateChanged:boolean = false;

  // constructor(private cdrC: ChangeDetectorRef, private zoneC: NgZone) {
  //   super(cdrC, zoneC);
  // }

  ngOnChanges(changes: SimpleChanges): void {
    this.loggerService.info('TextFieldComponent ngOnChanges');
    this.loggerService.info('TextFieldComponent changes');
    this.loggerService.info(changes);
    if(this.expressionStateChanged) {
      this.loggerService.info('TextFieldComponent expressionStateChanged '+this.expressionStateChanged);
      let that = this;
      that.zone.run(() => {
        if(!_isUndefined(that.formFieldComponentRef)) {
          that.initConfig();
          that.formFieldComponentRef.changeDetectorRef.detectChanges();
          that.expressionStateChanged = false;
        }
      });
    }
  }
}


@Component({
  selector: 'redbox-label',
  template: `
    @if (isLabelVisible) {
      <label>{{ message }} - I am still in the dom </label>
    }
    `,
  standalone: false
})
export class LabelComponent implements OnChanges {
  @Input() message!: string;
  @Input() expressionStateChanged!:boolean;
  public isLabelVisible = true;

  loggerService: LoggerService = inject(LoggerService);
  constructor(private cdrC: ChangeDetectorRef, private zoneC: NgZone) {
  }

  ngOnChanges(changes: SimpleChanges) {
    console.log('LabelComponent ngOnChanges:', changes);
    this.loggerService.info(changes);
    if(this.expressionStateChanged) {
      this.loggerService.info('LabelComponent expressionStateChanged '+this.expressionStateChanged);
      let that = this;
      that.zoneC.run(() => {
          that.isLabelVisible = !that.isLabelVisible;
          that.cdrC.detectChanges();
          that.expressionStateChanged = false;
      });
    }
  }
}