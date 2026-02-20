import {Component, inject, Input} from '@angular/core';
import { FormFieldBaseComponent, FormFieldModel } from "@researchdatabox/portal-ng-common";
import {
  isTypeFieldDefinitionName,
  RadioInputComponentName,
  RadioInputFieldComponentDefinitionFrame,
  RadioInputModelName,
  RadioInputModelValueType,
  RadioOption
} from '@researchdatabox/sails-ng-common';
import {FormService} from "../form.service";

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
            [formControl]="this.formControl"
            [attr.name]="this.getOptionName($index)"
            [name]="this.getOptionName($index)"
            [attr.value]="opt.value"
            [value]="opt.value"
            [id]="this.getOptionId(opt)"
            [attr.id]="this.getOptionId(opt)"
            [class.is-valid]="isValid"
            [class.is-invalid]="!isValid"
            [title]="tooltip">
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
export class RadioInputComponent extends FormFieldBaseComponent<RadioInputModelValueType> {
  protected override logName: string = RadioInputComponentName;
  public tooltip: string = '';
  public options: RadioOption[] = [];

  protected formService = inject(FormService);

  /**
   * The model associated with this component.
   */
  @Input() public override model?: RadioInputModel;

  protected override async initData(): Promise<void> {
    const formComponentFrame = this.componentDefinition;
    if (!isTypeFieldDefinitionName<RadioInputFieldComponentDefinitionFrame>(formComponentFrame, RadioInputComponentName)) {
      throw new Error(`${this.logName}: Expected ${RadioInputComponentName} but got ${JSON.stringify(formComponentFrame)}`);
    }
    const config = formComponentFrame.config;
    this.options = config?.options ?? [];
    this.tooltip = config?.tooltip ?? "";

    this.formService.setUpFieldMutationObserverToComponentEvents(this.formFieldCompMapEntry);
  }

  /**
   * Generate a unique ID for each option
   * @param opt The radio option
   * @returns A unique ID string
   */
  getOptionId(opt: RadioOption): string {
    return `${this.name}-${opt.value}`;
  }

  getOptionName(index: number): string {
    return this.name ?? index?.toString();
  }
}
