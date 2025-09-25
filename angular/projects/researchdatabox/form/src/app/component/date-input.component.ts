import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import { DateInputComponentConfig, DateInputModelValueType } from '@researchdatabox/sails-ng-common';
import { BsDatepickerConfig } from 'ngx-bootstrap/datepicker';
import { isUndefined as _isUndefined, isEmpty as _isEmpty } from 'lodash-es';

export class DateInputModel extends FormFieldModel<DateInputModelValueType> {
}

@Component({
  selector: 'redbox-date-input',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <input
        type="text"
        class="form-control"
        bsDatepicker
        [bsConfig]="bsConfig"
        [formControl]="formControl"
        [class.is-valid]="isValid"
        [class.is-invalid]="!isValid"
        [required]="isRequired"
        [disabled]="isDisabled"
        [readonly]="isReadonly"
        [title]="tooltip"
        [placeholder]="placeholder"
        autocomplete="off"
      />
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false
})
export class DateInputComponent extends FormFieldBaseComponent<DateInputModelValueType> {
  protected override logName: string = "DateInputComponent";
  public tooltip: string = '';
  public placeholder: string | undefined = 'DD/MM/YYYY';
  private dateFormat: string = 'DD/MM/YYYY';
  private showWeekNumbers: boolean = false;
  private containerClass: string = 'theme-dark-blue';

  public get bsConfig(): BsDatepickerConfig {
    return {
      dateInputFormat: this.dateFormat,
      showWeekNumbers: this.showWeekNumbers,
      containerClass: this.containerClass
    } as BsDatepickerConfig;
  }

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.tooltip = this.getStringProperty('tooltip');
    let dateConfig = this.componentDefinition?.config as DateInputComponentConfig;
    let defaultConfig = new DateInputComponentConfig();
    let cfg = (_isUndefined(dateConfig) || _isEmpty(dateConfig)) ? defaultConfig : dateConfig;
    this.placeholder = cfg.placeholder ?? defaultConfig.placeholder;
    this.dateFormat = cfg.dateFormat ?? defaultConfig.dateFormat ?? this.dateFormat;
    this.showWeekNumbers = cfg.showWeekNumbers ?? defaultConfig.showWeekNumbers ?? this.showWeekNumbers;
    this.containerClass = cfg.containerClass ?? defaultConfig.containerClass ?? this.containerClass;
  }

  @Input() public override model?: DateInputModel;
}


