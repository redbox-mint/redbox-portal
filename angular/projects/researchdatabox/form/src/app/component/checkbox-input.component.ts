import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent,FormFieldModel } from "@researchdatabox/portal-ng-common";
import {
  CheckboxOption,
  CheckboxInputModelValueType,
  CheckboxInputComponentName,
  CheckboxInputModelName,
  isTypeFieldDefinitionName,
  CheckboxInputFieldComponentDefinitionFrame,
} from '@researchdatabox/sails-ng-common';

export class CheckboxInputModel extends FormFieldModel<CheckboxInputModelValueType> {
  protected override logName = CheckboxInputModelName;
}

@Component({
  selector: 'redbox-checkbox',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')"/>
      @for (opt of options; track $index) {
        <div class="form-check">;
          <input
            type="checkbox"
            class="form-check-input"
            [formControl]="this.formControl"
            [attr.name]="this.getOptionName($index)"
            [name]="this.getOptionName($index)"
            [attr.value]="opt.value"
            [id]="this.getOptionId(opt)"
            [attr.id]="this.getOptionId(opt)"
            [checked]="isOptionSelected(opt.value)"
            (change)="onOptionChange($any($event.target).checked, opt.value)"
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
export class CheckboxInputComponent extends FormFieldBaseComponent<CheckboxInputModelValueType> {
  protected override logName = CheckboxInputComponentName;
  public tooltip: string = '';
  public placeholder: string | undefined = '';
  public options: CheckboxOption[] = [];
  public multipleValues: boolean = false;

  /**
   * The model associated with this component.
   */
  @Input() public override model?: CheckboxInputModel;

  protected override async initData(): Promise<void> {
    const formComponentFrame = this.componentDefinition;
    if (!isTypeFieldDefinitionName<CheckboxInputFieldComponentDefinitionFrame>(formComponentFrame, CheckboxInputComponentName)) {
      throw new Error(`${this.logName}: Expected ${CheckboxInputComponentName} but got ${JSON.stringify(formComponentFrame)}`);
    }
    const config = formComponentFrame.config;
    this.options = config?.options ?? [];
    this.tooltip = config?.tooltip ?? "";
    this.placeholder = config?.placeholder ?? "";
    this.multipleValues = config?.multipleValues ?? false;

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => console.log(mutation));
    });
    const observerConfig = {
      subtree: false,
      childList: false,
      attributes: true,
      attributeOldValue: false,
      // attributeFilter: [],
      characterData: false,
      characterDataOldValue: false,
    };

    observer.observe(this.formFieldCompMapEntry?.componentRef?.location?.nativeElement, observerConfig);
    observer.observe(this.formFieldCompMapEntry?.layoutRef?.location?.nativeElement, observerConfig);
    // TODO: createFieldMetaChangedEvent
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
  public onOptionChange(checked: boolean, optionValue: string): void {
    const currentValue = this.formControl?.value;
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

  /**
   * Generate a unique ID for each option
   * @param opt The checkbox option
   * @returns A unique ID string
   */
  getOptionId(opt: CheckboxOption): string {
    return `${this.name}-${opt.value}`;
  }

  getOptionName(index: number): string {
    return this.name ?? index?.toString();
  }
}


