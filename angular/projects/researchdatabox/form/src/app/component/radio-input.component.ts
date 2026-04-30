import { Component, Input } from '@angular/core';
import { FormFieldModel } from "@researchdatabox/portal-ng-common";
import {
  RadioInputComponentName,
  RadioInputFieldComponentDefinitionFrame,
  RadioInputModelName,
  RadioInputModelValueType,
  RadioOption
} from '@researchdatabox/sails-ng-common';
import { OptionInputBaseComponent } from './option-input-base.component';

export class RadioInputModel extends FormFieldModel<RadioInputModelValueType> {
  protected override logName = RadioInputModelName;
}

@Component({
  selector: 'redbox-radio',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')"/>
      @for (opt of options; track $index) {
        <div class="form-check">
          <input
            type="radio"
            class="form-check-input"
            [attr.name]="this.getOptionName($index)"
            [name]="this.getOptionName($index)"
            [attr.value]="opt.value"
            [value]="opt.value"
            [checked]="isOptionSelected(opt.value)"
            [attr.disabled]="isOptionDisabled(opt) ? true : null"
            [id]="this.getOptionId(opt)"
            [attr.id]="this.getOptionId(opt)"
            (change)="onOptionChange(opt)"
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
export class RadioInputComponent extends OptionInputBaseComponent<
  RadioInputModelValueType,
  RadioOption,
  RadioInputFieldComponentDefinitionFrame['config'],
  RadioInputFieldComponentDefinitionFrame
> {
  protected override logName: string = RadioInputComponentName;

  /**
   * The model associated with this component.
   */
  @Input() public override model?: RadioInputModel;

  protected override async initData(): Promise<void> {
    const config = this.getOptionInputConfig(RadioInputComponentName);
    this.setSharedOptionConfig(config);
  }

  public isOptionSelected(optionValue: string): boolean {
    return this.formControl?.value === optionValue;
  }

  public onOptionChange(option: RadioOption): void {
    if (this.isOptionDisabled(option)) {
      return;
    }
    this.setControlValue(option.value);
  }
}
