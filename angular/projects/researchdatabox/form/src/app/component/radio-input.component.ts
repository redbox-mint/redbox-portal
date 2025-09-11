import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import { RadioInputComponentConfig } from '@researchdatabox/sails-ng-common';
import { get as _get, isEmpty as _isEmpty, isUndefined as _isUndefined } from 'lodash-es';

export class RadioInputModel extends FormFieldModel<string> {
}

export interface RadioOption {
  label: string;
  value: any;
  disabled?: boolean;
}

@Component({
  selector: 'redbox-radio',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      @for (opt of options; track opt.value) {
        <div>
          <input 
            type="radio"
            [attr.name]="name"
            [formControl]="formControl"
            [id]="getOptionId(opt)"
            [value]="opt.value"
            [class.is-valid]="isValid"
            [class.is-invalid]="!isValid"
            [required]="isRequired"
            [disabled]="isDisabled || opt.disabled === true"
            [readonly]="isReadonly"
            [title]="tooltip">
          <label [for]="getOptionId(opt)">
            {{opt.label}}
          </label>
        </div>
      }
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false
})
export class RadioInputComponent extends FormFieldBaseComponent<string> {
  protected override logName: string = "RadioInputComponent";
  public tooltip: string = '';
  public options: RadioOption[] = [];

  /**
   * Override to set additional properties required by the wrapper component.
   *
   * @param formFieldCompMapEntry
   */
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.tooltip = this.getStringProperty('tooltip');
    let radioInputConfig = this.componentDefinition?.config as RadioInputComponentConfig;
    let defaultConfig = new RadioInputComponentConfig();
    const cfg = (_isUndefined(radioInputConfig) || _isEmpty(radioInputConfig)) ? defaultConfig : radioInputConfig;
    
    const cfgOptions: RadioOption[] = cfg.options;
    if (!_isUndefined(cfgOptions) && !_isEmpty(cfgOptions)) {
      this.options = cfgOptions;
    } else {
      this.options = defaultConfig.options;
    }
    
  }

  /**
   * Generate a unique ID for each radio option
   * @param opt The radio option
   * @returns A unique ID string
   */
  getOptionId(opt: RadioOption): string {
    return `${this.name}_${opt.value}`;
  }

  /**
   * The model associated with this component.
   */
  @Input() public override model?: RadioInputModel;
}
