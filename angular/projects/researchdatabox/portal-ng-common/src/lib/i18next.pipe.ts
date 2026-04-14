import { ChangeDetectorRef, DestroyRef, Pipe, PipeTransform, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ITranslationOptions, TranslationService } from './translation.service';

@Pipe({
  name: 'i18next',
  standalone: true,
  pure: false
})
export class I18NextPipe implements PipeTransform {
  private readonly translationService = inject(TranslationService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private subscribed = false;

  transform(key: unknown, options?: ITranslationOptions): string {
    this.ensureSubscription();

    if (key === null || key === undefined || key === '' || (Array.isArray(key) && key.length === 0)) {
      return '';
    }

    const translationKey = String(key);
    if (this.translationService.isInitializing()) {
      return translationKey;
    }

    const translated = options === undefined
      ? this.translationService.t(translationKey)
      : this.translationService.t(translationKey, options);
    return typeof translated === 'string' ? translated : String(translated ?? translationKey);
  }

  private ensureSubscription(): void {
    if (this.subscribed) {
      return;
    }

    const translationChanges$ = this.translationService.translationChanges$;
    this.subscribed = true;

    translationChanges$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.changeDetectorRef.markForCheck());
  }
}
