import { inject, Injectable } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { createEffect } from '@ngrx/effects';
import { catchError, concat, exhaustMap, from, ignoreElements, map, of, tap } from 'rxjs';
import { FormComponentEventBus } from '../../form-state/events/form-component-event-bus.service';
import { FormComponentEventType } from '../../form-state/events/form-component-event.types';
import { GenerationApiService } from '../generation-api.service';
import * as GenerationActions from './generation.actions';

@Injectable()
export class GenerationEffects {
  private readonly eventBus = inject(FormComponentEventBus);
  private readonly api = inject(GenerationApiService);
  private readonly document = inject(DOCUMENT);

  public readonly launch$ = createEffect(() => this.eventBus
    .select$(FormComponentEventType.FORM_RUNTIME_ACTION_INVOKED)
    .pipe(
      exhaustMap((event) => concat(
        of(GenerationActions.launchStarted()),
        from(this.api.launch({
          bindingKey: event.action.bindingKey,
          sourceOid: String(event.action.sourceOid ?? ''),
        })).pipe(
          tap((result) => this.document.defaultView?.location.assign(result.targetUrl)),
          ignoreElements(),
          catchError((error: unknown) => of(GenerationActions.launchFailed({
            error: error instanceof Error ? error.message : 'generation-launch-failed',
          }))),
        ),
      )),
    ));

  public readonly lifecycle$ = createEffect(() => this.eventBus
    .select$(FormComponentEventType.GENERATION_LIFECYCLE_CHANGED)
    .pipe(map((event) => GenerationActions.lifecycleChanged({
      status: event.status,
      phase: event.phase,
      error: event.error ?? null,
    }))));
}
