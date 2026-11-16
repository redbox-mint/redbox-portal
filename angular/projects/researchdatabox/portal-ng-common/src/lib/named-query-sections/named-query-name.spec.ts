import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TranslationService } from '../translation.service';
import { NamedQueryNameFieldComponent } from './named-query-name-field.component';
import { suggestNamedQueryName, validateNamedQueryName } from './named-query-name';

describe('Named query name', () => {
  for (const [value, error] of [
    ['', 'required'],
    ['active research plans', 'spaces'],
    ['bad!', 'invalid'],
    ['collections', 'reserved'],
    ['a'.repeat(121), 'long'],
  ]) {
    it(`explains ${error} without silently trimming`, () => {
      expect(validateNamedQueryName(value)).toBe('named-query-error-name-' + error);
    });
  }
  it('accepts exactly 120 URL-safe characters and keeps the reserved check case sensitive like the server', () => {
    expect(validateNamedQueryName('a'.repeat(120))).toBeNull();
    expect(validateNamedQueryName('Collections_123-abc')).toBeNull();
  });
  it('always suggests a valid bounded name', () => {
    for (const value of [
      'active research plans',
      ' __ ! many / spaces __ ',
      'collections',
      '',
      '!'.repeat(125),
      'a'.repeat(121),
    ])
      expect(validateNamedQueryName(suggestNamedQueryName(value))).toBeNull();
    expect(suggestNamedQueryName(' __ active / research ! plans __ ')).toBe('active_research_plans');
  });
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NamedQueryNameFieldComponent],
      providers: [
        {
          provide: TranslationService,
          useValue: { t: (key: string) => key, isInitializing: () => false, translationChanges$: of() },
        },
      ],
    });
  });
  it('keeps untouched required quiet, then links the inline message on blur or save', async () => {
    const f = TestBed.createComponent(NamedQueryNameFieldComponent);
    f.detectChanges();
    await f.whenStable();
    const input: HTMLInputElement = f.nativeElement.querySelector('input');
    expect(f.nativeElement.querySelector('.invalid-feedback')).toBeNull();
    input.dispatchEvent(new Event('blur'));
    f.detectChanges();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('nq-name-help nq-name-error');
    expect(f.nativeElement.querySelector('.invalid-feedback').textContent).toContain('required');
  });
  it('shows spaces as typed and applies the suggestion with focus retained', async () => {
    const f = TestBed.createComponent(NamedQueryNameFieldComponent);
    f.detectChanges();
    await f.whenStable();
    const changed = spyOn(f.componentInstance.nameChange, 'emit');
    const input: HTMLInputElement = f.nativeElement.querySelector('input');
    input.value = 'active research plans';
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(input.classList.contains('is-invalid')).toBeTrue();
    expect(f.nativeElement.querySelector('.invalid-feedback').textContent).toContain('spaces');
    f.nativeElement.querySelector('button').click();
    f.detectChanges();
    await f.whenStable();
    expect(changed).toHaveBeenCalledWith('active_research_plans');
    expect(input.value).toBe('active_research_plans');
    expect(document.activeElement).toBe(input);
    expect(f.nativeElement.querySelector('.invalid-feedback')).toBeNull();
  });
});
