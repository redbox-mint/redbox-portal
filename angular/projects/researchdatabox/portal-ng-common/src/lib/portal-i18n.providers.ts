import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';

import { TranslationService } from './translation.service';

export function providePortalI18n(): EnvironmentProviders {
  return provideAppInitializer(() => inject(TranslationService).waitForInit());
}

export function providePortalI18nTesting(): EnvironmentProviders {
  return providePortalI18n();
}
