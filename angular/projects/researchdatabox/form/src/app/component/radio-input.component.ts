import {Component, inject, Input} from '@angular/core';
import { FormFieldBaseComponent, FormFieldModel, TranslationService } from "@researchdatabox/portal-ng-common";
import {
  isTypeFieldDefinitionName,
  RadioInputComponentName,
  RadioInputFieldComponentDefinitionFrame,
  RadioInputModelName,
  RadioInputModelValueType,
  RadioOption
} from '@researchdatabox/sails-ng-common';

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
            [class.is-valid]="showValidState"
            [class.is-invalid]="!isValid"
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
export class RadioInputComponent extends FormFieldBaseComponent<RadioInputModelValueType> {
  protected override logName: string = RadioInputComponentName;
  public tooltip: string = '';
  public options: RadioOption[] = [];
  private readonly translationService = inject(TranslationService);

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
