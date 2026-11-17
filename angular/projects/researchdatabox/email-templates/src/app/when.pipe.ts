import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from '@researchdatabox/portal-ng-common';

/** Short local date and time, for example "27 Oct 2026, 14:02". */
@Pipe({ name: 'emailWhen', standalone: true })
export class WhenPipe implements PipeTransform {
  private readonly i18n = inject(TranslationService);
  private readonly formats = new Map<string, Intl.DateTimeFormat>();

  transform(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    let language = 'en';
    try {
      language = this.i18n.getCurrentLanguage() || 'en';
    } catch {
      // Fall back to English formatting before the translator is ready.
    }
    let format = this.formats.get(language);
    if (!format) {
      format = new Intl.DateTimeFormat(language === 'en' ? 'en-AU' : language, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      this.formats.set(language, format);
    }
    return format.format(date);
  }
}
