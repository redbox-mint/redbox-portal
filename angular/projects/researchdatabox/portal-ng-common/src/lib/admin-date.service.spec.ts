import { TestBed } from '@angular/core/testing';
import { AdminDateService, formatAdminDate } from './admin-date.service';
import { TranslationService } from './translation.service';
import { getStubTranslationService } from './helper.spec';

describe('Admin date display', () => {
  it('uses the same 24-hour convention for ISO, Date and numeric timestamps', () => {
    const iso = '2026-11-05T18:36:00Z';
    for (const value of [iso, new Date(iso), Date.parse(iso)]) {
      expect(formatAdminDate(value, undefined, 'en', 'UTC')).toBe('05/11/2026 18:36');
    }
    expect(formatAdminDate(null)).toBe('');
    expect(formatAdminDate('unexpected')).toBe('unexpected');
  });

  it('matches local calendar fields for offset timestamps, epochs and dates without locale discovery', () => {
    const instant = new Date('2026-10-04T01:30:00+09:30');
    const pad = (n: number) => String(n).padStart(2, '0');
    const expected = `${pad(instant.getDate())}/${pad(instant.getMonth() + 1)}/${instant.getFullYear()} ${pad(instant.getHours())}:${pad(instant.getMinutes())}`;
    for (const value of [instant, instant.getTime(), instant.toISOString(), '2026-10-04T01:30:00+09:30']) {
      expect(formatAdminDate(value)).toBe(expected);
    }
    expect(formatAdminDate('2026-10-04')).toBe('04/10/2026 00:00');
    expect(formatAdminDate('invalid')).toBe('invalid');
    expect(formatAdminDate('2026-02-30T00:00:00Z')).toBe('2026-02-30T00:00:00Z');
  });

  it('keeps the calendar day in the report filter zone across a DST boundary', () => {
    expect(formatAdminDate('2026-10-04T00:00:00+10:00', 'dd/MM/yyyy', 'en', 'Australia/Sydney')).toBe('04/10/2026');
  });

  it('takes display formats and matching datepicker hints from the portal translations', () => {
    TestBed.configureTestingModule({ providers: [
      { provide: TranslationService, useValue: getStubTranslationService({
        'admin-date-format': 'MM/dd/yyyy', 'admin-date-time-format': 'MM/dd/yyyy HH:mm',
        'admin-date-placeholder': 'mm/dd/yyyy'
      }) }
    ] });
    const dates = TestBed.inject(AdminDateService);
    expect(dates.format('2026-11-05T18:36:00Z', false, 'UTC')).toBe('11/05/2026 18:36');
    expect(dates.format('2026-11-05', true)).toBe('11/05/2026');
    expect(dates.placeholder).toBe('mm/dd/yyyy');
    expect(dates.pickerFormat).toBe('MM/DD/YYYY');
  });
});
