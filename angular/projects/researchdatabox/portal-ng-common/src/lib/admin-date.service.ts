import { Injectable, inject } from '@angular/core';
import { DateTime } from 'luxon';
import { TranslationService } from './translation.service';

export const ADMIN_DATE_FORMAT = 'dd/MM/yyyy';
export const ADMIN_DATE_TIME_FORMAT = `${ADMIN_DATE_FORMAT} HH:mm`;

/** Display only: request serialization and date-range boundaries belong to each app. */
export function formatAdminDate(value: string | number | Date | null | undefined,
  format = ADMIN_DATE_TIME_FORMAT, locale = 'en', zone = 'local'): string {
  if (value == null || value === '') return '';
  // The shared admin numeric format needs no locale discovery or Intl formatter.
  // Keep Luxon for custom formats/zones and ISO values without an explicit offset.
  if (zone === 'local' && /^en(?:-|$)/i.test(locale) && [ADMIN_DATE_FORMAT, ADMIN_DATE_TIME_FORMAT].includes(format)
      && (value instanceof Date || typeof value === 'number' || /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value))) {
    const nativeDate = new Date(value);
    if (Number.isFinite(nativeDate.getTime()) && (typeof value !== 'string'
        || new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) === value.slice(0, 10))) {
      const pad = (part: number) => String(part).padStart(2, '0');
      const day = `${pad(nativeDate.getDate())}/${pad(nativeDate.getMonth() + 1)}/${String(nativeDate.getFullYear()).padStart(4, '0')}`;
      return format === ADMIN_DATE_FORMAT ? day : `${day} ${pad(nativeDate.getHours())}:${pad(nativeDate.getMinutes())}`;
    }
  }
  const date = value instanceof Date ? DateTime.fromMillis(value.getTime(), { zone, locale })
    : typeof value === 'number' ? DateTime.fromMillis(value, { zone, locale })
    : DateTime.fromISO(value, { zone, locale });
  return date.isValid ? date.toFormat(format) : String(value);
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
