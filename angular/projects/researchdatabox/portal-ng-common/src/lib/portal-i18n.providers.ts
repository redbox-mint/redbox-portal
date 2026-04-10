import { APP_INITIALIZER, EnvironmentProviders, FactoryProvider, makeEnvironmentProviders } from '@angular/core';
import { InitOptions } from 'i18next';

import { PORTAL_I18N_TEST_OPTIONS, TranslationService } from './translation.service';

function createPortalI18nInitializer(): FactoryProvider {
  return {
    provide: APP_INITIALIZER,
    multi: true,
    deps: [TranslationService],
    useFactory: (translationService: TranslationService) => () => translationService.waitForInit()
  };
}

export function providePortalI18n(): EnvironmentProviders {
  return makeEnvironmentProviders([createPortalI18nInitializer()]);
}

export function providePortalI18nTesting(options: InitOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: PORTAL_I18N_TEST_OPTIONS,
      useValue: options
    },
    createPortalI18nInitializer()
  ]);
}
