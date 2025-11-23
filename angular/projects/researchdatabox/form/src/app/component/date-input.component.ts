import { Component, Input, ViewChild } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import {
  DateInputFieldComponentConfigFrame,
  DateInputFieldComponentConfig,
  DateInputModelValueType,
  DateInputModelName, DateInputComponentName,
} from '@researchdatabox/sails-ng-common';
import { DateTime } from 'luxon';
import { BsDatepickerConfig, BsDatepickerDirective } from 'ngx-bootstrap/datepicker';
import { isUndefined as _isUndefined, isEmpty as _isEmpty, isNull as _isNull } from 'lodash-es';

export class DateInputModel extends FormFieldModel<DateInputModelValueType> {
  public override logName = DateInputModelName;
  public enableTimePicker: boolean = false;
  public dateFormat: string = '';

  public setTimeValue(timeValue: string): void {
    if(this.enableTimePicker) {
      //TODO: Implementation of time input requires more work to handle timezones properly and this will be done in a later PR if/when required
      let isoDts:string = `${this.stripTimeFromJSDate(this.formControl?.value as Date)}T${timeValue}:00.000Z`;
      let jsDate = DateTime.fromISO(isoDts).toJSDate();
      this.setValueDontEmitEvent(jsDate);
    }
  }

  private stripTimeFromJSDate(date: Date): string {
    if (!_isUndefined(date) && !_isNull(date)) {
      let formatted = DateTime.fromJSDate(date).toFormat('yyyy-MM-dd');
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
          <span class="input-group-text date-input-addon" (click)="toggleDatepicker()" >
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
      width: 12rem !important;
    }
    .date-input-addon {
      height: 34px;
    }`],
  standalone: false
})
export class DateInputComponent extends FormFieldBaseComponent<DateInputModelValueType> {
  protected override logName = DateInputComponentName;
  public tooltip: string = '';
  public placeholder: string | undefined = 'DD/MM/YYYY';
  private dateFormatDefault: string = 'DD/MM/YYYY';
  private showWeekNumbers: boolean = false;
  private containerClass: string = 'theme-dark-blue';
  private bsFullConfig: any = {};
  public enableTimePickerDefault: boolean = false;

  @ViewChild(BsDatepickerDirective) datepicker!: BsDatepickerDirective;

  override ngAfterViewInit() {
    this.formControl.valueChanges.subscribe((value: DateInputModelValueType) => {
      this.onDateChange(value);
    });

    super.ngAfterViewInit();
  }

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.tooltip = this.getStringProperty('tooltip');
    let dateConfig = this.componentDefinition?.config as DateInputFieldComponentConfigFrame;
    let defaultConfig = new DateInputFieldComponentConfig();
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

  onDateChange(dateValue: DateInputModelValueType) {
    this.loggerService.info(`dateValue ${dateValue}`,'');
    // this.model?.setValue(dateValue);
  }

  //Note there are at least two known issues with ngx timepicker plus the layout with arrows above and below the time input field
  //boxes doesn't align with ReDBox standard field's layout and doesn't look good and hence ngx timepicker is not used in the
  //implementation just for reference see the github issues here:
  //1. TimepickerComponent gets corrupted after disabling and enabling https://github.com/valor-software/ngx-bootstrap/issues/6673
  //2. Time Picker Component - Change event not working https://github.com/valor-software/ngx-bootstrap/issues/2209
  //Although numer 2 is a seemingly old issue it's still present in the latest version of ngx-bootstrap as of June 2024.
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

  public toggleDatepicker(): void {
    if (this.datepicker.isOpen) {
      this.datepicker.hide();
    } else {
      this.datepicker.show();
    }
  }

  get dateFormat(): string {
    return this.model?.dateFormat ?? this.dateFormatDefault;
  }

  get enableTimePicker(): boolean {
    return this.model?.enableTimePicker ?? this.enableTimePickerDefault;
  }

  @Input() public override model?: DateInputModel;
}


