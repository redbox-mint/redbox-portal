/**
 * Provider Wiring Test
 * 
 * Verifies that provideFormFeature() correctly registers NgRx providers.
 * Per Task 1 requirement.
 */

import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { provideFormFeature, FORM_FEATURE_KEY } from './providers';
import { FormFeatureState, formInitialState } from './state/form.state';
import { FormEffects } from './effects/form.effects';

describe('provideFormFeature()', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideFormFeature()
      ]
    });
  });

  it('should register the form feature state with NgRx store', () => {
    const store = TestBed.inject(Store);
    expect(store).toBeDefined();
    
    // Verify the feature state is initialized
    let state: FormFeatureState | undefined;
    store.select((s: any) => s[FORM_FEATURE_KEY]).subscribe(val => state = val);
    
    expect(state).toEqual(formInitialState);
  });

  it('should register FormEffects', () => {
    // Effects are registered via provideEffects, so they should be injectable
    const effects = TestBed.inject(FormEffects);
    expect(effects).toBeDefined();
    expect(effects.actions$).toBeDefined();
  });

  it('should use the correct feature key', () => {
    expect(FORM_FEATURE_KEY).toBe('form');
  });
});
