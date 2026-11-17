import { TestBed } from '@angular/core/testing';
import i18next from 'i18next';
import { AdminCountPipe } from './admin-count.pipe';
import { TranslationService } from './translation.service';

describe('Admin header counts', () => {
  it('formats zero, singular, plural and filtered totals consistently', async () => {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: 'en', resources: { en: { translation: {
      'admin-count-user_one': 'user', 'admin-count-user_other': 'users',
      'admin-count-total': '{{count}} {{items}}', 'admin-count-filtered': '{{count}} of {{total}} {{items}}'
    } } } });
    TestBed.configureTestingModule({ providers: [{ provide: TranslationService, useValue: { t: i18n.t.bind(i18n) } }] });
    const pipe = TestBed.runInInjectionContext(() => new AdminCountPipe());
    expect(pipe.transform(0, 'user')).toBe('0 users');
    expect(pipe.transform(1, 'user')).toBe('1 user');
    expect(pipe.transform(8, 'user', 8)).toBe('8 users');
    expect(pipe.transform(1, 'user', 8)).toBe('1 of 8 users');
  });
});
