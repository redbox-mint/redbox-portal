import { Component, inject, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldModel, TranslationService } from "@researchdatabox/portal-ng-common";
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
        <div class="form-check">
          <input
            type="checkbox"
            class="form-check-input"
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
            {{ getOptionLabel(opt.label) }}
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
  private readonly translationService = inject(TranslationService);

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
    this.multipleValues = config?.multipleValues ?? true;

  }

  protected getOptionLabel(label: string): string {
    const labelFromLanguageMap = this.resolveLanguageMapLabel(label);
    if (labelFromLanguageMap !== null) {
      return this.translate(labelFromLanguageMap);
    }
    const labelFromLanguageCode = this.resolveLanguageCodeLabel(label);
    if (labelFromLanguageCode !== null) {
      return labelFromLanguageCode;
    }
    return this.translate(label);
  }

  private translate(value: string): string {
    const translated = this.translationService.t(value);
    if (translated === undefined || translated === null || translated === '') {
      return value;
    }
    const result = typeof translated === 'string' ? translated : String(translated);
    return (result === '' || result === 'undefined') ? value : result;
  }

  private resolveLanguageMapLabel(label: string): string | null {
    const parsed = this.tryParseJsonObject(label);
    if (!parsed) {
      return null;
    }

    const currentLanguage = this.translationService.getCurrentLanguage();
    const baseLanguage = currentLanguage.split('-')[0];
    const value = parsed[currentLanguage] ?? parsed[baseLanguage] ?? parsed['en'] ?? Object.values(parsed).find((v) => !!v);
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private resolveLanguageCodeLabel(label: string): string | null {
    const normalizedCode = label.trim().replace('_', '-');
    if (!/^[a-z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(normalizedCode)) {
      return null;
    }

    const languageName = new Intl.DisplayNames(
      [this.translationService.getCurrentLanguage(), 'en'],
      {type: 'language'}
    ).of(normalizedCode);

    if (!languageName || languageName === normalizedCode) {
      return null;
    }
    return languageName;
  }

  private tryParseJsonObject(value: string): Record<string, string> | null {
    const trimmed = value?.trim?.();
    if (!trimmed || !trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      return null;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, string>;
    } catch {
      return null;
    }
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
