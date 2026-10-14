import { Component, Input } from '@angular/core';
import { FormFieldModel } from '@researchdatabox/portal-ng-common';
import {
  DropdownInputComponentName,
  DropdownInputFieldComponentDefinitionFrame,
  DropdownInputModelName,
  DropdownInputModelValueType,
  DropdownOption,
} from '@researchdatabox/sails-ng-common';
import { isUndefined as _isUndefined } from 'lodash-es';
import { OptionInputBaseComponent } from './option-input-base.component';

export class DropdownInputModel extends FormFieldModel<DropdownInputModelValueType> {
  protected override logName = DropdownInputModelName;
}

@Component({
  selector: 'redbox-dropdown',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <select
        [formControl]="formControl"
        class="form-select"
        [class.is-valid]="showValidState"
        [class.is-invalid]="!isValid"
        [title]="tooltip | i18next"
      >
        @if (placeholder) {
          <option [value]="''" disabled>{{ placeholder | i18next }}</option>
        }
        @for (opt of options; track opt.value) {
          <option [value]="opt.value" [disabled]="opt.disabled === true">{{ opt.label | i18next }}</option>
        }
      </select>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false,
})
export class DropdownInputComponent extends OptionInputBaseComponent<
  DropdownInputModelValueType,
  DropdownOption,
  DropdownInputFieldComponentDefinitionFrame['config'],
  DropdownInputFieldComponentDefinitionFrame
> {
  protected override logName = DropdownInputComponentName;

  protected override async initData(): Promise<void> {
    // Validate the component definition; options, tooltip and placeholder are read from the config on demand.
    this.getOptionInputConfig(DropdownInputComponentName);
    this.setDefaultSelection();
  }

  private setDefaultSelection(): void {
    const currentValue = this.formControl?.value;
    if (!_isUndefined(currentValue) && currentValue !== null && currentValue !== '') {
      return;
    }

    if (this.options.some(option => option.value === '') || this.placeholder) {
      this.formControl?.setValue('', { emitEvent: false });
      return;
    }

    if (this.options.length > 0) {
      this.formControl?.setValue(this.options[0].value, { emitEvent: false });
    }
  }

  /**
   * The model associated with this component.
   */
  @Input() public override model?: DropdownInputModel;
}
