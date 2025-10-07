import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import { DateInputComponentConfig, DateInputModelValueType } from '@researchdatabox/sails-ng-common';
import { DateTime } from 'luxon';
import { BsDatepickerConfig } from 'ngx-bootstrap/datepicker';
import { isUndefined as _isUndefined, isEmpty as _isEmpty, isNull as _isNull } from 'lodash-es';
import { AbstractControl, FormControl } from '@angular/forms';

export class DateInputModel extends FormFieldModel<DateInputModelValueType> {

  public timeControl?: AbstractControl<DateInputModelValueType>;
  public enableTimePicker: boolean = false;
  public dateFormat: string = '';

  override setValue(value: DateInputModelValueType): void {
    if(!_isNull(value) || !_isUndefined(value)) {
      let val: Date = value as Date;
      this.setValueDontEmitEvent(val);
    }
  }

  override getValue(): DateInputModelValueType | undefined {
    return DateTime.fromISO(this.formControl?.value as string).toJSDate();
  }

  override postCreate(): void {
    super.postCreate();
    if(this.enableTimePicker) {
      this.timeControl = new FormControl<DateInputModelValueType>('');
    } 
  }

  public setTimeValue(value: DateInputModelValueType): void {
    if(this.enableTimePicker) {
      this.timeControl?.setValue(value);
      let isoDt:string = `${this.stripTimeFromJSDate(this.formControl?.value as Date,'yyyy-MM-dd')}T${value}:00.000Z`;
      this.setValueDontEmitEvent(DateTime.fromISO(isoDt).toJSDate());
    }
  }

  private stripTimeFromJSDate(date: Date, format:string): string {
    if (!_isNull(date)) {
      let formatted = DateTime.fromJSDate(date).toFormat(format);
      return formatted;
    } 
    return '';
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
  private dateFormatDefault: string = 'DD/MM/YYYY';
  private showWeekNumbers: boolean = false;
  private containerClass: string = 'theme-dark-blue';
  private bsFullConfig: any = {};
  public enableTimePickerDefault: boolean = false;

  onDateChange(dateValue: DateInputModelValueType) {
    this.loggerService.info(`dateValue ${dateValue}`,'');
    this.model?.setValue(dateValue);
  }

  onTimeChange(event: Event) {
    let timeValue = (event.target as HTMLInputElement).value as string;
    this.loggerService.info(`timeValue ${timeValue}`,'');
    this.model?.setTimeValue(timeValue);
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

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.tooltip = this.getStringProperty('tooltip');
    let dateConfig = this.componentDefinition?.config as DateInputComponentConfig;
    let defaultConfig = new DateInputComponentConfig();
    let cfg = (_isUndefined(dateConfig) || _isEmpty(dateConfig)) ? defaultConfig : dateConfig;
    this.placeholder = cfg.placeholder ?? defaultConfig.placeholder;
    this.showWeekNumbers = cfg.showWeekNumbers ?? defaultConfig.showWeekNumbers ?? this.showWeekNumbers;
    this.containerClass = cfg.containerClass ?? defaultConfig.containerClass ?? this.containerClass;
    this.bsFullConfig = cfg.bsFullConfig ?? {};
    if(!_isUndefined(this.model)) {
      this.model.dateFormat = cfg.dateFormat ?? defaultConfig.dateFormat ?? this.dateFormatDefault;
      this.model.enableTimePicker = cfg.enableTimePicker ?? defaultConfig.enableTimePicker ?? this.enableTimePickerDefault;
    }
  }

  override ngAfterViewInit() {
    this.formControl.valueChanges.subscribe((value: DateInputModelValueType) => {
      this.onDateChange(value); 
    });
    
    super.ngAfterViewInit();
  }

  get dateFormat(): string {
    return this.model?.dateFormat ?? this.dateFormatDefault;
  }

  get enableTimePicker(): boolean {
    return this.model?.enableTimePicker ?? this.enableTimePickerDefault;
  }

  @Input() public override model?: DateInputModel;
}


