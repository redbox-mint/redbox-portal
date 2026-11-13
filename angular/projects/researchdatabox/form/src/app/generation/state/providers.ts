import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';
import { GenerationEffects } from './generation.effects';
import { generationReducer } from './generation.reducer';
import { GENERATION_FEATURE_KEY } from './generation.state';

export function provideGenerationFeature(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideState(GENERATION_FEATURE_KEY, generationReducer),
    provideEffects(GenerationEffects),
  ]);
}
