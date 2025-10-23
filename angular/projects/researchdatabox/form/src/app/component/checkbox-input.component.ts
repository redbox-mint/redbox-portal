import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import { isEmpty as _isEmpty, isUndefined as _isUndefined } from 'lodash-es';
import {
  CheckboxInputFieldComponentConfig,
  CheckboxOption,
  CheckboxInputModelValueType,
  CheckboxInputComponentName, CheckboxInputModelName
} from '@researchdatabox/sails-ng-common';

export class CheckboxInputModel extends FormFieldModel<CheckboxInputModelValueType> {
  protected override logName = CheckboxInputModelName;
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
export class CheckboxInputComponent extends FormFieldBaseComponent<CheckboxInputModelValueType> {
  protected override logName = CheckboxInputComponentName;
  public tooltip: string = '';
  public placeholder: string | undefined = '';
  public options: CheckboxOption[] = [];
  public multipleValues: boolean = false;
  /**
   * Override to set additional properties required by the wrapper component.
   *
   * @param formFieldCompMapEntry
   */
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.tooltip = this.getStringProperty('tooltip');
    this.placeholder = this.getStringProperty('placeholder');
    let checkboxConfig = this.componentDefinition?.config as CheckboxInputFieldComponentConfig;
    let defaultConfig = new CheckboxInputFieldComponentConfig();
    const cfg = (_isUndefined(checkboxConfig) || _isEmpty(checkboxConfig)) ? defaultConfig : checkboxConfig;
    this.placeholder = cfg.placeholder || defaultConfig.placeholder;
    this.multipleValues = cfg.multipleValues ?? defaultConfig.multipleValues ?? false;
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
   * Check whether an option is selected based on the current control value and multipleValues configuration.
   */
  public isOptionSelected(optionValue: string): boolean {
    const currentValue = this.formControl?.value as string | Array<string>;
    if (this.multipleValues) {
      const currentArray = Array.isArray(currentValue) ? currentValue : [];
      return currentArray.includes(optionValue);
    } else {
      return currentValue === optionValue;
    }
  }

  /**
   * Toggle option selection. Supports array values (multi-select) and single value based on multipleValues configuration.
   */
  public onOptionChange(checked: boolean, optionValue: string): void {
    const currentValue = this.formControl?.value as string | Array<string>;
    if (this.multipleValues) {
      const currentArray = Array.isArray(currentValue) ? currentValue : [];
      const next = checked
        ? (currentArray.includes(optionValue) ? currentArray : [...currentArray, optionValue])
        : currentArray.filter((v: string) => v !== optionValue);
      this.formControl.setValue(next);
    } else {
      this.formControl.setValue(checked ? optionValue : '');
    }
    this.formControl.markAsDirty();
    this.formControl.markAsTouched();
  }
}


