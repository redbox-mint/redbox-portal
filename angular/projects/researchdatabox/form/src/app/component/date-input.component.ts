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
  public placeholder: string | undefined = '';
  public dateFormat: string = 'YYYY-MM-DD';
  public minDate: Date | undefined;
  public maxDate: Date | undefined;

  public get bsConfig() {
    return {
      dateInputFormat: this.dateFormat,
      minDate: this.minDate,
      maxDate: this.maxDate,
      adaptivePosition: true,
      showWeekNumbers: false
    } as BsDatepickerConfig;
  }

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.tooltip = this.getStringProperty('tooltip');
    const dateConfig = this.componentDefinition?.config as DateInputComponentConfig;
    const defaultConfig = new DateInputComponentConfig();
    const cfg = (_isUndefined(dateConfig) || _isEmpty(dateConfig)) ? defaultConfig : dateConfig;
    this.placeholder = cfg.placeholder ?? defaultConfig.placeholder;
    this.dateFormat = cfg.dateFormat ?? defaultConfig.dateFormat ?? this.dateFormat;
    this.minDate = this.parseDate(cfg.minDate ?? defaultConfig.minDate);
    this.maxDate = this.parseDate(cfg.maxDate ?? defaultConfig.maxDate);
  }

  private parseDate(value: string | Date | null | undefined): Date | undefined {
    if (!value) { return undefined; }
    if (value instanceof Date) { return value; }
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }

  @Input() public override model?: DateInputModel;
}


