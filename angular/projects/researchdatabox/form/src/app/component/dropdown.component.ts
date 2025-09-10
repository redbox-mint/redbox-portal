import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import { get as _get, isEmpty as _isEmpty, isUndefined as _isUndefined } from 'lodash-es';

export class DropdownModel extends FormFieldModel<string | number | null> {
}

export interface DropdownOption {
  label: string;
  value: any;
  disabled?: boolean;
}

@Component({
  selector: 'redbox-dropdown',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <select [formControl]="formControl"
        class="form-control"
        [class.is-valid]="isValid"
        [class.is-invalid]="!isValid"
        [required]="isRequired"
        [disabled]="isDisabled"
        [readonly]="isReadonly"
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
export class DropdownComponent extends FormFieldBaseComponent<string | number | null> {
  protected override logName: string = "DropdownComponent";
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
    const cfgOptions = _get(this.componentDefinition, 'config.options', []);
    if (!_isUndefined(cfgOptions) && !_isEmpty(cfgOptions)) {
      this.options = cfgOptions as DropdownOption[];
    } else {
      this.options = [];
    }
  }

  /**
   * The model associated with this component.
   */
  @Input() public override model?: DropdownModel;
}


