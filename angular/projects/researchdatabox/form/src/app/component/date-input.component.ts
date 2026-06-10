import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import {
  FormFieldBaseComponent,
  FormFieldCompMapEntry,
  FormFieldModel,
  ModifyOptions,
} from '@researchdatabox/portal-ng-common';
import { DateInputFieldComponentConfig } from '@researchdatabox/sails-ng-common/dist/src/config/component/date-input.model';
import {
  DateInputComponentName,
  DateInputModelName,
  type DateInputFieldComponentConfigFrame,
  type DateInputModelValueType,
} from '@researchdatabox/sails-ng-common/dist/src/config/component/date-input.outline';
import { mapMomentToLuxonFormat } from '@researchdatabox/sails-ng-common/dist/src/date-format-helpers';
import { DateTime } from 'luxon';
import { BsDatepickerConfig, BsDatepickerDirective } from 'ngx-bootstrap/datepicker';
import { isUndefined as _isUndefined, isEmpty as _isEmpty, isNull as _isNull } from 'lodash-es';

function normalizeDateInputValue(value: unknown): DateInputModelValueType | undefined {
  if (_isUndefined(value) || _isNull(value)) {
    return value as DateInputModelValueType;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (trimmedValue === '') {
      return null;
    }

    const isoDate = DateTime.fromISO(trimmedValue);
    if (isoDate.isValid) {
      return isoDate.toJSDate();
    }

    const jsDate = new Date(trimmedValue);
    if (!Number.isNaN(jsDate.getTime())) {
      return jsDate;
    }
  }

  return undefined;
}

function areDateInputValuesEqual(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeDateInputValue(left);
  const normalizedRight = normalizeDateInputValue(right);

  if (normalizedLeft === undefined || normalizedRight === undefined) {
    return left === right;
  }

  if (normalizedLeft === null || normalizedRight === null) {
    return normalizedLeft === normalizedRight;
  }

  return normalizedLeft.getTime() === normalizedRight.getTime();
}

function isInvalidDateValue(value: unknown): boolean {
  if (value instanceof Date) return Number.isNaN(value.getTime());
  if (typeof value === 'string') return value.trim().toLowerCase() === 'invalid date';
  return false;
}

function detectSeparator(text: string): string | undefined {
  const match = text.match(/[\/\-\.\s]/);
  return match ? match[0] : undefined;
}

export function parseFreeTextDate(rawText: string | null | undefined, dateFormat: string): Date | null | undefined {
  if (!rawText || rawText.trim() === '') {
    return null;
  }

  const text = rawText.trim();
  const sep = detectSeparator(dateFormat) || '/';
  const luxonFmt = mapMomentToLuxonFormat(dateFormat);

  function tryParse(val: string, fmt: string): Date | undefined {
    const dt = DateTime.fromFormat(val, fmt, { zone: 'utc' });
    if (dt.isValid) {
      return dt.toJSDate();
    }
    return undefined;
  }

  let result = tryParse(text, luxonFmt);
  if (result !== undefined) return result;

  const textSep = detectSeparator(text);
  if (textSep && textSep !== sep) {
    const normalizedText = text.split(textSep).join(sep);
    result = tryParse(normalizedText, luxonFmt);
    if (result !== undefined) return result;
  }

  const textParts = text.split(textSep || sep);
  if (textParts.length === 3) {
    const formatParts = dateFormat.split(sep);
    if (formatParts.length === 3) {
      const fmtYearPos = formatParts.findIndex(p => /Y/.test(p));
      const fmtMonthPos = formatParts.findIndex(p => p === 'MM');
      const fmtDayPos = formatParts.findIndex(p => /^D/.test(p));

      if (fmtYearPos !== -1 && fmtMonthPos !== -1 && fmtDayPos !== -1) {
        const interpretations: [number, number, number][] = [
          [0, 1, 2],
          [2, 1, 0],
          [2, 0, 1],
        ];

        const defaultInterp: [number, number, number] = [fmtYearPos, fmtMonthPos, fmtDayPos];
        const candidates: Array<{ date: Date; interpretation: [number, number, number] }> = [];

        for (const interpretation of interpretations) {
          if (
            interpretation[0] === defaultInterp[0] &&
            interpretation[1] === defaultInterp[1] &&
            interpretation[2] === defaultInterp[2]
          ) {
            continue;
          }

          const yearVal = textParts[interpretation[0]];
          const monthVal = textParts[interpretation[1]];
          const dayVal = textParts[interpretation[2]];

          if (!yearVal || !monthVal || !dayVal) continue;

          const monthNumber = Number(monthVal);
          const dayNumber = Number(dayVal);

          if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
            continue;
          }

          if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) {
            continue;
          }

          const reconstructed = new Array<string>(3);
          reconstructed[fmtYearPos] = yearVal;
          reconstructed[fmtMonthPos] = monthVal;
          reconstructed[fmtDayPos] = dayVal;
          const reassembled = reconstructed.join(sep);

          const dt = tryParse(reassembled, luxonFmt);
          if (dt !== undefined) {
            candidates.push({ date: dt, interpretation });
          }
        }

        if (candidates.length === 1) {
          return candidates[0].date;
        }

        if (candidates.length > 1) {
          candidates.sort((left, right) => {
            for (let index = 0; index < left.interpretation.length; index += 1) {
              const delta = left.interpretation[index] - right.interpretation[index];
              if (delta !== 0) {
                return delta;
              }
            }

            return 0;
          });

          return candidates[0].date;
        }
      }
    }
  }

  const isoDate = DateTime.fromISO(text);
  if (isoDate.isValid) {
    return isoDate.toJSDate();
  }

  return undefined;
}

export class DateInputModel extends FormFieldModel<DateInputModelValueType> {
  public override logName = DateInputModelName;
  public enableTimePicker: boolean = false;
  public dateFormat: string = '';

  protected override postCreateGetInitValue(): DateInputModelValueType | undefined {
    return normalizeDateInputValue(this.fieldConfig.config?.value) ?? null;
  }

  public override setValue(value: DateInputModelValueType, opts?: ModifyOptions): void {
    const normalizedValue = normalizeDateInputValue(value);
    super.setValue((normalizedValue ?? value) as DateInputModelValueType, opts);
  }

  public override patchValue(value: DateInputModelValueType, opts?: ModifyOptions): void {
    const normalizedValue = normalizeDateInputValue(value);
    super.patchValue((normalizedValue ?? value) as DateInputModelValueType, opts);
  }

  public setTimeValue(timeValue: string): void {
    if (this.enableTimePicker) {
      //TODO: Implementation of time input requires more work to handle timezones properly and this will be done in a later PR if/when required
      let isoDts: string = `${this.stripTimeFromJSDate(this.formControl?.value as Date)}T${timeValue}:00.000Z`;
      let jsDate = DateTime.fromISO(isoDts).toJSDate();
      this.setValue(jsDate, { emitEvent: false });
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
          #dateInputEl
          [bsConfig]="bsConfig"
          [formControl]="formControl"
          [class.is-valid]="showValidState"
          [class.is-invalid]="!isValid"
          [readonly]="isReadonly"
          [title]="tooltip | i18next"
          [placeholder]="placeholder | i18next"
          (blur)="onInputBlur($event)"
        />
        <div class="input-group-append">
          <span class="input-group-text date-input-addon" (click)="toggleDatepicker()">
            <i class="fa fa-calendar"></i>
          </span>
        </div>
        @if (enableTimePicker) {
          <input type="time" class="form-control" [readonly]="isReadonly" (change)="onTimeChange($event)" />
        }
      </div>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  styles: [
    `
      .date-input-width {
        flex: none !important;
        width: 50% !important;
      }
      .date-input-addon {
        height: 34px;
      }
    `,
  ],
  standalone: false,
})
export class DateInputComponent extends FormFieldBaseComponent<DateInputModelValueType> {
  protected override logName = DateInputComponentName;
  public tooltip: string = '';
  public placeholder: string | undefined = 'yyyy/mm/dd';
  private dateFormatDefault: string = 'YYYY/MM/DD';
  private showWeekNumbers: boolean = false;
  private robustParsing: boolean = true;
  private containerClass: string = 'theme-dark-blue';
  private bsFullConfig: any = {};
  public enableTimePickerDefault: boolean = false;
  private lastValidValue: Date | null = null;

  @ViewChild(BsDatepickerDirective) datepicker!: BsDatepickerDirective;
  @ViewChild('dateInputEl') dateInputEl!: ElementRef<HTMLInputElement>;

  override ngAfterViewInit() {
    this.syncDateValue(this.formControl?.value);
    this.formControl.valueChanges.subscribe((value: DateInputModelValueType | string) => {
      this.syncDateValue(value);
    });

    super.ngAfterViewInit();
  }

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.tooltip = this.getStringProperty('tooltip');
    let dateConfig = this.componentDefinition?.config as DateInputFieldComponentConfigFrame;
    let defaultConfig = new DateInputFieldComponentConfig();
    let cfg = _isUndefined(dateConfig) || _isEmpty(dateConfig) ? defaultConfig : dateConfig;
    this.placeholder = cfg.placeholder ?? defaultConfig.placeholder ?? this.placeholder;
    this.showWeekNumbers = cfg.showWeekNumbers ?? defaultConfig.showWeekNumbers ?? this.showWeekNumbers;
    this.robustParsing = cfg.robustParsing ?? defaultConfig.robustParsing ?? this.robustParsing;
    this.containerClass = cfg.containerClass ?? defaultConfig.containerClass ?? this.containerClass;
    this.bsFullConfig = cfg.bsFullConfig ?? {};
    if (!_isUndefined(this.model)) {
      this.model.dateFormat = cfg.dateFormat ?? defaultConfig.dateFormat ?? this.dateFormatDefault;
      this.model.enableTimePicker =
        cfg.enableTimePicker ?? defaultConfig.enableTimePicker ?? this.enableTimePickerDefault;
    }
  }

  onDateChange(dateValue: DateInputModelValueType) {
    const currentValue = this.model?.getValue();
    // Protect against infinite loops, as `onDateChange` is called in `ngAfterViewInit`.
    // `ngAfterViewInit` is run as part of change detection, such as when the model value is changed.
    if (!areDateInputValuesEqual(currentValue, dateValue)) {
      this.model?.setValue(dateValue);
    }
  }

  private syncDateValue(dateValue: DateInputModelValueType | string | undefined): void {
    if (isInvalidDateValue(dateValue)) {
      const recovery = this.lastValidValue instanceof Date ? this.lastValidValue : null;
      this.rewriteInputValue(recovery);
      this.formControl?.setValue(recovery, { emitEvent: true });
      return;
    }

    const normalizedValue = normalizeDateInputValue(dateValue);

    if (typeof dateValue === 'string' && normalizedValue === undefined) {
      return;
    }

    if (normalizedValue !== undefined && !areDateInputValuesEqual(this.formControl?.value, normalizedValue)) {
      this.formControl?.setValue(normalizedValue, { emitEvent: typeof dateValue === 'string' });
    }

    this.onDateChange((normalizedValue ?? dateValue ?? null) as DateInputModelValueType);

    if (normalizedValue instanceof Date) {
      this.lastValidValue = normalizedValue;
    }
  }

  //Note there are at least two known issues with ngx timepicker plus the layout with arrows above and below the time input field
  //boxes doesn't align with ReDBox standard field's layout and doesn't look good and hence ngx timepicker is not used in the
  //implementation just for reference see the github issues here:
  //1. TimepickerComponent gets corrupted after disabling and enabling https://github.com/valor-software/ngx-bootstrap/issues/6673
  //2. Time Picker Component - Change event not working https://github.com/valor-software/ngx-bootstrap/issues/2209
  //Although numer 2 is a seemingly old issue it's still present in the latest version of ngx-bootstrap as of June 2024.
  onTimeChange(event: Event) {
    let timeValue = (event.target as HTMLInputElement).value as string;
    this.loggerService.info(`timeValue ${timeValue}`, '');
    this.model?.setTimeValue(timeValue);
  }

  onInputBlur(event: FocusEvent): void {
    const inputEl = event.target as HTMLInputElement;
    const rawText = inputEl?.value || '';
    if (!rawText || rawText.trim() === '') {
      this.lastValidValue = null;
      this.formControl?.setValue(null, { emitEvent: true });
      return;
    }

    if (!this.robustParsing) {
      const luxonFmt = mapMomentToLuxonFormat(this.dateFormat);
      const matchesConfiguredFormat = DateTime.fromFormat(rawText, luxonFmt, { zone: 'utc' }).isValid;

      if (!matchesConfiguredFormat) {
        Promise.resolve().then(() => {
          this.formControl?.setValue(rawText as unknown as DateInputModelValueType, { emitEvent: true });
          inputEl.value = rawText;
        });
      }
      return;
    }

    const parsed = parseFreeTextDate(rawText, this.dateFormat);
    if (parsed instanceof Date) {
      const luxonFmt = mapMomentToLuxonFormat(this.dateFormat);
      const formatted = DateTime.fromJSDate(parsed, { zone: 'utc' }).toFormat(luxonFmt);
      inputEl.value = formatted;
      if (!areDateInputValuesEqual(this.formControl?.value, parsed)) {
        this.formControl?.setValue(parsed, { emitEvent: true });
      }
    } else {
      this.rewriteInputValue(this.lastValidValue);
      this.formControl?.setValue(this.lastValidValue, { emitEvent: true });
    }
  }

  private rewriteInputValue(value: Date | null): void {
    const inputEl = this.dateInputEl?.nativeElement;
    if (!inputEl) return;
    if (value instanceof Date) {
      const luxonFmt = mapMomentToLuxonFormat(this.dateFormat);
      inputEl.value = DateTime.fromJSDate(value, { zone: 'utc' }).toFormat(luxonFmt);
    } else {
      inputEl.value = '';
    }
  }

  public get bsConfig(): BsDatepickerConfig {
    if (_isEmpty(this.bsFullConfig)) {
      //Commonly used properties only
      return {
        dateInputFormat: this.dateFormat,
        showWeekNumbers: this.showWeekNumbers,
        containerClass: this.containerClass,
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
