import { FormlyFieldConfig } from '@ngx-formly/core';
import { dictionarySummary } from './config-form';

const booleans = (value: boolean) => value ? 'enabled' : 'disabled';
const field = (key: string, type = 'string', props = {}): FormlyFieldConfig => ({ key, type, props });
const site = { fieldGroup: [field('enabled', 'app-config-checkbox'), field('label'), field('publicUrl'), field('token', 'app-config-secret')] };

describe('dictionary row summaries', () => {
  it('prioritises identifying values over storage order and field names', () => {
    expect(dictionarySummary(site, { enabled: true, label: 'Staging OCFL', publicUrl: 'http://localhost:11000', token: 'secret' }, booleans))
      .toBe('Staging OCFL · http://localhost:11000/ · enabled');
  });
  it('uses current values and translated boolean state', () => {
    expect(dictionarySummary(site, { label: 'Public', enabled: false }, booleans)).toBe('Public · disabled');
    expect(dictionarySummary(site, { enabled: false }, () => 'Off')).toBe('Off');
  });
  it('never shows declared secrets, unknown JSON, hidden values or masks', () => {
    const fields = { fieldGroup: [field('label', 'app-config-secret'), field('name', 'string', { secret: true }),
      { ...field('title'), hide: true }, field('id'), field('type', 'app-config-json')] };
    expect(dictionarySummary(fields, { label: 'secret', name: 'secret', title: 'hidden', id: '__REDACTED_FROM__:secret', type: 'secret' }, booleans)).toBe('');
    expect(dictionarySummary({}, { label: 'opaque secret' }, booleans)).toBe('');
    expect(dictionarySummary(site, { token: 'secret', arbitrary: 'secret', nested: { label: 'secret' } }, booleans)).toBe('');
    expect(dictionarySummary(site, ['secret'], booleans)).toBe('');
  });
  it('omits URL credentials, query strings, fragments and unsafe protocols', () => {
    expect(dictionarySummary(site, { publicUrl: 'https://example.test/site?token=secret#secret' }, booleans)).toBe('https://example.test/site');
    for (const publicUrl of ['https://user:secret@example.test', 'javascript:secret', 'not-a-url']) {
      expect(dictionarySummary(site, { publicUrl }, booleans)).toBe('');
    }
  });
  it('bounds long scalar values and the complete summary', () => {
    const fields = { fieldGroup: ['label', 'name', 'title'].map(key => field(key)) };
    const result = dictionarySummary(fields, { label: 'A'.repeat(200), name: 'B'.repeat(200), title: 'C'.repeat(200) }, booleans);
    expect(result.length).toBeLessThanOrEqual(160);
    expect(result).toContain('…');
    expect(dictionarySummary(site, null, booleans)).toBe('');
  });
});
