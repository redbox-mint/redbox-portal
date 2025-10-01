import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import { DropdownInputFieldComponentConfig, DropdownInputModelValueType, DropdownOption } from '@researchdatabox/sails-ng-common';
import { get as _get, isEmpty as _isEmpty, isUndefined as _isUndefined } from 'lodash-es';

export class DropdownInputModel extends FormFieldModel<DropdownInputModelValueType> {
}

@Component({
  selector: 'redbox-dropdown',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <select [formControl]="formControl"
        class="form-select"
        [class.is-valid]="isValid"
        [class.is-invalid]="!isValid"
        [required]="isRequired"
        [disabled]="isDisabled"
        [title]="tooltip">
        @if (placeholder) {
          <option [ngValue]="null" disabled>{{placeholder}}</option>
        }
        @for (opt of options; track opt.value) {
          <option [ngValue]="opt.value" [disabled]="opt.disabled === true">{{opt.label}}</option>
        }
      </select>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false
})
export class DropdownInputComponent extends FormFieldBaseComponent<DropdownInputModelValueType> {
  protected override logName: string = "DropdownInputComponent";
  public tooltip: string = '';
  public placeholder: string | undefined = '';
  public options: DropdownOption[] = [];

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
  }

  /**
   * The model associated with this component.
   */
  @Input() public override model?: DropdownInputModel;
}


