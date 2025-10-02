/**
 * Form State Providers
 * 
 * Standalone providers for registering form state feature with NgRx.
 * Per R1.1, R1.2, R1.3, R14.1
 */

import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideState } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { formReducer } from './state/form.reducer';
import { FormEffects } from './effects/form.effects';

/**
 * Feature key for form state slice
 * Per R1.3
 */
export const FORM_FEATURE_KEY = 'form';

/**
 * Provides form state feature registration with NgRx.
 * 
 * Registers:
 * - Form feature state with key 'form' (R1.1, R1.3)
 * - FormEffects for side-effects (R1.2)
 * 
 * @returns Array of providers for standalone APIs
 * 
 * @example
 * ```ts
 * // In app.config.ts or component providers
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideStore(),
 *     provideEffects(),
 *     provideFormFeature(),
 *     // ... other providers
 *   ]
 * };
 * ```
 */
export function provideFormFeature(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideState(FORM_FEATURE_KEY, formReducer),
    provideEffects(FormEffects)
  ]);
}
