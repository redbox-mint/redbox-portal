import { Injectable, inject } from '@angular/core';
import { DateTime } from 'luxon';
import { TranslationService } from './translation.service';

export const ADMIN_DATE_FORMAT = 'dd/MM/yyyy';
export const ADMIN_DATE_TIME_FORMAT = `${ADMIN_DATE_FORMAT} HH:mm`;

/** Display only: request serialization and date-range boundaries belong to each app. */
export function formatAdminDate(value: string | number | Date | null | undefined,
  format = ADMIN_DATE_TIME_FORMAT, locale = 'en', zone = 'local'): string {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? DateTime.fromJSDate(value, { zone })
    : typeof value === 'number' ? DateTime.fromMillis(value, { zone })
    : DateTime.fromISO(value, { zone });
  return date.isValid ? date.setLocale(locale).toFormat(format) : String(value);
}

@Injectable({ providedIn: 'root' })
export class AdminDateService {
  private readonly translations = inject(TranslationService);

  get dateFormat(): string { return this.translations.t('admin-date-format', ADMIN_DATE_FORMAT); }
  get dateTimeFormat(): string { return this.translations.t('admin-date-time-format', ADMIN_DATE_TIME_FORMAT); }
  get placeholder(): string { return this.translations.t('admin-date-placeholder', 'dd/mm/yyyy'); }
  get pickerFormat(): string { return this.dateFormat.replace(/yyyy/g, 'YYYY').replace(/dd/g, 'DD'); }

  format(value: string | number | Date | null | undefined, dateOnly = false, zone = 'local'): string {
    return formatAdminDate(value, dateOnly ? this.dateFormat : this.dateTimeFormat,
      this.translations.getCurrentLanguage?.() || 'en', zone);
  }
}
