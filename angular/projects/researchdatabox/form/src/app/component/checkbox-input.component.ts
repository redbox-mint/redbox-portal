import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import { get as _get, isEmpty as _isEmpty, isUndefined as _isUndefined } from 'lodash-es';
import { CheckboxInputComponentConfig } from '@researchdatabox/sails-ng-common';

export class CheckboxInputModel extends FormFieldModel<string | boolean | null> {
}

export interface CheckboxOption {
  label: string;
  value: any;
  disabled?: boolean;
}

@Component({
  selector: 'redbox-checkbox',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      @for (opt of options; track opt.value) {
        <div class="form-check">
          <input type="checkbox"
            class="form-check-input"
            [checked]="isOptionSelected(opt.value)"
            [required]="isRequired"
            [disabled]="isDisabled || opt.disabled === true"
            [title]="tooltip"
            (change)="onOptionChange($any($event.target).checked, opt.value)"
            id="{{name}}-{{opt.value}}"
          />
          <label class="form-check-label" [attr.for]="name + '-' + opt.value">{{opt.label}}</label>
        </div>
      }
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false
})
export class CheckboxInputComponent extends FormFieldBaseComponent<string | boolean | null> {
  protected override logName: string = "CheckboxInputComponent";
  public tooltip: string = '';
  public placeholder: string | undefined = '';
  public options: CheckboxOption[] = [];
  public trackByValue = (_: number, opt: CheckboxOption) => opt.value;
  /**
   * Override to set additional properties required by the wrapper component.
   *
   * @param formFieldCompMapEntry
   */
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.tooltip = this.getStringProperty('tooltip');
    this.placeholder = this.getStringProperty('placeholder');
    let checkboxConfig = this.componentDefinition?.config as CheckboxInputComponentConfig;
    let defaultConfig = new CheckboxInputComponentConfig();
    const cfg = (_isUndefined(checkboxConfig) || _isEmpty(checkboxConfig)) ? defaultConfig : checkboxConfig;
    this.placeholder = cfg.placeholder || defaultConfig.placeholder;
    const cfgOptions:CheckboxOption[] = cfg.options;
    if (!_isUndefined(cfgOptions) && !_isEmpty(cfgOptions)) {
      this.options = cfgOptions;
    } else {
      this.options = defaultConfig.options;
    }
  }

  /**
   * The model associated with this component.
   */
  @Input() public override model?: CheckboxInputModel;

  /**
   * Check whether an option is selected based on the current control value.
   */
  public isOptionSelected(optionValue: any): boolean {
    const currentValue = this.formControl?.value as any;
    if (Array.isArray(currentValue)) {
      return currentValue.includes(optionValue);
    }
    return currentValue === optionValue || currentValue === true;
  }

  /**
   * Toggle option selection. Supports array values (multi-select) and single value.
   */
  public onOptionChange(checked: boolean, optionValue: any): void {
    const currentValue = this.formControl?.value as any;
    if (Array.isArray(currentValue)) {
      const next = checked
        ? (currentValue.includes(optionValue) ? currentValue : [...currentValue, optionValue])
        : currentValue.filter((v: any) => v !== optionValue);
      this.formControl.setValue(next as any);
    } else {
      this.formControl.setValue(checked ? optionValue : null as any);
    }
    this.formControl.markAsDirty();
    this.formControl.markAsTouched();
  }
}


