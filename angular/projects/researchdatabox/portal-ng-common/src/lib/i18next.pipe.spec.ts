import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { I18NextPipe } from './i18next.pipe';
import { TranslationService } from './translation.service';

class TranslationServiceStub {
  private initializing = false;
  private translations: Record<string, string> = {};
  readonly translationChanges$ = new Subject<void>();

  setInitializing(initializing: boolean): void {
    this.initializing = initializing;
  }

  setTranslations(translations: Record<string, string>): void {
    this.translations = translations;
  }

  emitChange(): void {
    this.translationChanges$.next();
  }

  isInitializing(): boolean {
    return this.initializing;
  }

  t(key: string, options?: Record<string, unknown>): string {
    let value = this.translations[key] ?? key;
    if (!options) {
      return value;
    }

    for (const [optionKey, optionValue] of Object.entries(options)) {
      value = value.replace(`{{${optionKey}}}`, String(optionValue));
    }

    return value;
  }
}

@Component({
  standalone: true,
  imports: [I18NextPipe],
  template: `<div class="translated">{{ key | i18next: options }}</div>`
})
class PipeHostComponent {
  key: string | null | undefined = 'greeting';
  options?: Record<string, unknown>;
}

describe('I18NextPipe', () => {
  let translationService: TranslationServiceStub;

  beforeEach(async () => {
    translationService = new TranslationServiceStub();
    translationService.setTranslations({
      greeting: 'Hello',
      welcome: 'Welcome {{name}}',
    });

    await TestBed.configureTestingModule({
      imports: [PipeHostComponent],
      providers: [
        {
          provide: TranslationService,
          useValue: translationService
        }
      ]
    }).compileComponents();
  });

  it('should render translated values when the translation service is ready', () => {
    const fixture = TestBed.createComponent(PipeHostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.translated')?.textContent.trim()).toBe('Hello');
  });

  it('should return the key while the translation service is still initializing', () => {
    translationService.setInitializing(true);
    const fixture = TestBed.createComponent(PipeHostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.translated')?.textContent.trim()).toBe('greeting');
  });

  it('should return an empty string for null or undefined keys', () => {
    const fixture = TestBed.createComponent(PipeHostComponent);
    fixture.componentInstance.key = null;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.translated')?.textContent.trim()).toBe('');

    fixture.componentInstance.key = undefined;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.translated')?.textContent.trim()).toBe('');
  });

  it('should pass interpolation options to the translation service', () => {
    const fixture = TestBed.createComponent(PipeHostComponent);
    fixture.componentInstance.key = 'welcome';
    fixture.componentInstance.options = { name: 'Taylor' };
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.translated')?.textContent.trim()).toBe('Welcome Taylor');
  });

  it('should update the rendered value when translation changes are emitted', () => {
    const fixture = TestBed.createComponent(PipeHostComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.translated')?.textContent.trim()).toBe('Hello');

    translationService.setTranslations({
      greeting: 'Bonjour'
    });
    translationService.emitChange();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.translated')?.textContent.trim()).toBe('Bonjour');
  });
});
