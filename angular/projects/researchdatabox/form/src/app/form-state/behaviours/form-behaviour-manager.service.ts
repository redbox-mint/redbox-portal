import { Injectable, OnDestroy } from '@angular/core';
import { LoggerService, RecordService } from '@researchdatabox/portal-ng-common';
import { FormComponent } from '../../form.component';
import { FormComponentEventBus } from '../events/form-component-event-bus.service';
import { BehaviourHandler } from './behaviour-handler';

@Injectable({ providedIn: 'root' })
/**
 * Binds form-level behaviours to a `FormComponent` instance.
 *
 * Intent:
 * - provide one place where the form runtime turns config into live handlers
 * - keep `FormComponent` orchestration simple while preserving the strict timing
 *   requirement that behaviours bind before `FORM_DEFINITION_READY`
 *
 * v1 notes:
 * - only built-in behaviour types are supported
 * - binding is synchronous; compiled templates are loaded lazily by handlers
 * - destroying the manager tears down every behaviour subscription
 */
export class FormBehaviourManager implements OnDestroy {
  private handlers: BehaviourHandler[] = [];

  constructor(
    private readonly eventBus: FormComponentEventBus,
    private readonly logger: LoggerService,
    private readonly recordService: RecordService
  ) {}

  /**
   * Bind all enabled behaviours from the current form config.
   *
   * This method must remain cheap and synchronous because the caller invokes it
   * immediately before publishing `FORM_DEFINITION_READY`.
   */
  bind(formComponent: FormComponent): void {
    this.destroy();
    const behaviours =
      (formComponent.formDefMap?.formConfig as { behaviours?: unknown[] } | undefined)?.behaviours ?? [];
    for (let index = 0; index < behaviours.length; index++) {
      const behaviour = behaviours[index] as any;
      if (behaviour.enabled === false) {
        continue;
      }
      const handler = new BehaviourHandler(behaviour, index, {
        eventBus: this.eventBus,
        formComponent,
        logger: this.logger,
        recordService: this.recordService,
      });
      handler.activate();
      this.handlers.push(handler);
    }
  }

  /**
   * Release all active behaviour handlers.
   */
  destroy(): void {
    this.handlers.forEach(handler => handler.destroy());
    this.handlers = [];
  }

  ngOnDestroy(): void {
    this.destroy();
  }
}
