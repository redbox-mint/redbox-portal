import { Component, Input } from '@angular/core';
import {
  FormFieldBaseComponent,
  FormFieldCompMapEntry,
  FormFieldModel,
  ModifyOptions
} from "@researchdatabox/portal-ng-common";
import {
  DropdownInputComponentName,
  DropdownInputFieldComponentConfig,
  DropdownInputModelName,
  DropdownInputModelValueType,
  DropdownOption
} from '@researchdatabox/sails-ng-common';
import { isEmpty as _isEmpty, isUndefined as _isUndefined } from 'lodash-es';

export class DropdownInputModel extends FormFieldModel<DropdownInputModelValueType> {
  protected override logName = DropdownInputModelName;

  /**
   * Set this model to be disabled or enabled.
   *
   * Component 'disabled' must be set as well,
   * because the Angular formControl manages the HTML element disabled property.
   *
   * Use component.setDisabled instead of this method.
   *
   * @param disabled Set the disabled status.
   * @param opts The modify options.
   */
  public override setDisabled(disabled: boolean, opts?: ModifyOptions): void {
    super.setDisabled(disabled, opts)
  }
}

@Component({
  selector: 'redbox-dropdown',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <select [formControl]="formControl"
        class="form-select"
        [class.is-valid]="showValidState"
        [class.is-invalid]="!isValid"
        [title]="tooltip | i18next">
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
  standalone: false
})
export class DropdownInputComponent extends FormFieldBaseComponent<DropdownInputModelValueType> {
  protected override logName = DropdownInputComponentName;
  public tooltip: string = '';
  public placeholder: string | undefined = '';
  public options: DropdownOption[] = [];

  /**
   * The model associated with this component.
   */
  @Input() public override model?: DropdownInputModel;

  /**
   * Override to set additional properties required by the wrapper component.
   *
   * @param formFieldCompMapEntry
   */
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.tooltip = this.getStringProperty('tooltip');
    this.placeholder = this.getStringProperty('placeholder');
    let dropdownInputConfig = this.componentDefinition?.config as DropdownInputFieldComponentConfig;
    let defaultConfig = new DropdownInputFieldComponentConfig();
    const cfg = (_isUndefined(dropdownInputConfig) || _isEmpty(dropdownInputConfig)) ? defaultConfig : dropdownInputConfig;
    const cfgOptions:DropdownOption[] = cfg.options;
    if (!_isUndefined(cfgOptions) && !_isEmpty(cfgOptions)) {
      this.options = cfgOptions;
    } else {
      this.options = defaultConfig.options;
    }
    this.setDefaultSelection();
  }

  private setDefaultSelection(): void {
    const currentValue = this.formControl?.value;
    if (!_isUndefined(currentValue) && currentValue !== null && currentValue !== '') {
      return;
    }

    if (this.options.some((option) => option.value === '') || this.placeholder) {
      this.formControl?.setValue('', { emitEvent: false });
      return;
    }

    if (this.options.length > 0) {
      this.formControl?.setValue(this.options[0].value, { emitEvent: false });
    }
  }

  override get isDisabled(): boolean {
    return super.isDisabled || this.model?.isDisabled || false;
  }

  override setDisabled(disabled: boolean, opts?: ModifyOptions) {
    super.setDisabled(disabled);
    this.model?.setDisabled(disabled, {emitEvent: false, onlySelf: true});
  }
}
