import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import { DateInputComponentConfig, DateInputModelValueType } from '@researchdatabox/sails-ng-common';
import { DateTime } from 'luxon';
import { BsDatepickerConfig } from 'ngx-bootstrap/datepicker';
import { isUndefined as _isUndefined, isEmpty as _isEmpty } from 'lodash-es';

export class DateInputModel extends FormFieldModel<DateInputModelValueType> {

  public updateDateTimeValue(enableTimePicker:boolean, dateValue:string, timeValue:string, dateInputFormat:string) {
    if(enableTimePicker) {
      if (dateValue && timeValue) {
        this.setValue(`${this.convertToISODate(dateValue,dateInputFormat)}T${timeValue}`);
      }
    } else {
      this.setValue(dateValue);
    }
  }
  
  private convertToISODate(dateStr: string, format:string): string | null {
    if (!_isEmpty(dateStr)) {
      const dt = DateTime.fromFormat(dateStr, format);
      return dt.isValid ? dt.toISODate() : null;
    } 
    return null;
  }
}

@Component({
  selector: 'redbox-date-input',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <div class="input-group flex-nowrap">
        <input
          type="text"
          class="form-control date-input-width"
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
          (ngModelChange)="onDateChange($event)"
        />
        <div class="input-group-append">
          <span class="input-group-text date-input-addon" >
            <i class="fa fa-calendar"></i>
          </span>
        </div>
        @if (enableTimePicker) {
          <input
            type="time"
            class="form-control"
            [disabled]="isDisabled"
            [readonly]="isReadonly"
            (change)="onTimeChange($event)"
          />
        }
      </div>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  styles: [`
    .date-input-width {
      flex: none !important;
      width: 50% !important;
    }
    .date-input-addon {
      height: 34px;
    }`],
  standalone: false
})
export class DateInputComponent extends FormFieldBaseComponent<DateInputModelValueType> {
  protected override logName: string = "DateInputComponent";
  public tooltip: string = '';
  public placeholder: string | undefined = 'DD/MM/YYYY';
  private dateFormat: string = 'DD/MM/YYYY';
  private showWeekNumbers: boolean = false;
  private containerClass: string = 'theme-dark-blue';
  private bsFullConfig: any = {};
  public enableTimePicker: boolean = false;
  private dateValue: string = '';
  private timeValue: string = '';

  onDateChange(event:Date) {
    this.dateValue = event ? event.toISOString().split('T')[0] : '';
    this.loggerService.info(`dateValue ${this.dateValue}`,'');
    this.updateModelValue();
  }

  onTimeChange(event: Event) {
    this.timeValue = (event.target as HTMLInputElement).value;
    this.loggerService.info(`timeValue ${this.timeValue}`,'');
    this.updateModelValue();
  }

  private updateModelValue() {
    this.model?.updateDateTimeValue(this.enableTimePicker, this.dateValue, this.timeValue, this.bsConfig.dateInputFormat);
  }

  public get bsConfig(): BsDatepickerConfig {
    if(_isEmpty(this.bsFullConfig)) {
      //Commonly used properties only
      return {
        dateInputFormat: this.dateFormat,
        showWeekNumbers: this.showWeekNumbers,
        containerClass: this.containerClass
      } as BsDatepickerConfig;
    } else {
      return this.bsFullConfig as BsDatepickerConfig;
    }
  }

  public setDateFormat(format: string): void {
    this.dateFormat = format;
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
    this.enableTimePicker = cfg.enableTimePicker ?? defaultConfig.enableTimePicker ?? this.enableTimePicker;
    this.bsFullConfig = cfg.bsFullConfig ?? {};
  }

  @Input() public override model?: DateInputModel;
}


