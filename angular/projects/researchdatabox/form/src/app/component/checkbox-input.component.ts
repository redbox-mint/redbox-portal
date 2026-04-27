import { Component, Input } from '@angular/core';
import { FormFieldModel } from "@researchdatabox/portal-ng-common";
import {
  CheckboxOption,
  CheckboxInputModelValueType,
  CheckboxInputComponentName,
  CheckboxInputModelName,
  CheckboxInputFieldComponentDefinitionFrame,
} from '@researchdatabox/sails-ng-common';
import { OptionInputBaseComponent } from './option-input-base.component';

export class CheckboxInputModel extends FormFieldModel<CheckboxInputModelValueType> {
  protected override logName = CheckboxInputModelName;
}

@Component({
  selector: 'redbox-checkbox',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')"/>
      @for (opt of options; track $index) {
        <div class="form-check">
          <!-- Checkbox groups share one control value, so selection is driven manually instead of binding each input with formControl. -->
          <input
            type="checkbox"
            class="form-check-input"
            [attr.name]="this.getOptionName($index)"
            [name]="this.getOptionName($index)"
            [attr.value]="opt.value"
            [id]="this.getOptionId(opt)"
            [attr.id]="this.getOptionId(opt)"
            [checked]="isOptionSelected(opt.value)"
            [attr.disabled]="isOptionDisabled(opt) ? true : null"
            (change)="onOptionChange($any($event.target).checked, opt)"
            [class.is-valid]="showValidState"
            [class.is-invalid]="!isValid"
            [title]="tooltip | i18next">
          <label
            class="form-check-label"
            [attr.for]="getOptionId(opt)">
            {{ opt.label | i18next }}
          </label>
        </div>
      }
      <ng-container *ngTemplateOutlet="getTemplateRef('after')"/>
    }
  `,
  standalone: false
})
export class CheckboxInputComponent extends OptionInputBaseComponent<
  CheckboxInputModelValueType,
  CheckboxOption,
  CheckboxInputFieldComponentDefinitionFrame['config'],
  CheckboxInputFieldComponentDefinitionFrame
> {
  protected override logName = CheckboxInputComponentName;
  public placeholder: string | undefined = '';
  public multipleValues: boolean = true;

  /**
   * The model associated with this component.
   */
  @Input() public override model?: CheckboxInputModel;

  protected override async initData(): Promise<void> {
    const config = this.getOptionInputConfig(CheckboxInputComponentName);
    this.setSharedOptionConfig(config);
    this.placeholder = config?.placeholder ?? "";
    this.multipleValues = config?.multipleValues ?? true;

  }

  /**
   * Check whether an option is selected based on the current control value and multipleValues configuration.
   */
  public isOptionSelected(optionValue: string): boolean {
    const currentValue = this.formControl?.value;
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
  public onOptionChange(checked: boolean, option: CheckboxOption): void {
    if (this.isOptionDisabled(option)) {
      return;
    }
    const optionValue = option.value;
    const currentValue = this.formControl?.value;
    if (this.multipleValues) {
      const currentArray = Array.isArray(currentValue) ? currentValue : [];
      const nextValue: CheckboxInputModelValueType = checked
        ? (currentArray.includes(optionValue) ? currentArray : [...currentArray, optionValue])
        : currentArray.filter((v: string) => v !== optionValue);
      this.setControlValue(nextValue);
    } else {
      const nextValue: CheckboxInputModelValueType = checked ? optionValue : '';
      this.setControlValue(nextValue);
    }
  }
}
