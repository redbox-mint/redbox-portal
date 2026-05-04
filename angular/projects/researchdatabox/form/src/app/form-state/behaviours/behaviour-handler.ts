import { debounceTime, Observable, Subscription } from 'rxjs';
import {
  ExpressionsConditionKind,
  FieldPathKind,
  FormBehaviourActionConfig,
  FormBehaviourConfigFrame,
} from '@researchdatabox/sails-ng-common';
import { FormFieldCompMapEntry, LoggerService, RecordService } from '@researchdatabox/portal-ng-common';
import { FormComponent } from '../../form.component';
import { FormComponentEventBus } from '../events/form-component-event-bus.service';
import {
  FormComponentEvent,
  FormComponentEventMap,
  FormComponentEventType,
} from '../events/form-component-event.types';
import {
  BehaviourCompiledItemsModule,
  BehaviourCompiledTemplateEvaluator,
} from './behaviour-compiled-template-evaluator';
import { isRepeatableFieldEntry, resolveFieldByPointer } from './behaviour-field-resolver';
import { matchBehaviourCondition } from './behaviour-condition-matcher';
import { BehaviourPipelineContext, executeBehaviourProcessor } from './behaviour-processors';
import { executeBehaviourAction } from './behaviour-actions';
import { getEventJSONPointerCondition } from '../events/form-component-base-event-producer-consumer';

/**
 * Services and runtime references shared by behaviour handlers.
 */
export interface BehaviourHandlerContext {
  eventBus: FormComponentEventBus;
  formComponent: FormComponent;
  logger: LoggerService;
  recordService: RecordService;
}

export class BehaviourHandler {
  private readonly subscriptions: Subscription[] = [];
  private readonly logicalFieldEntries = new Map<string, FormFieldCompMapEntry>();
  private readonly permanentlySkippedActions = new Set<string>();
  private readonly metadataCache = new Map<string, unknown>();
  private isProcessingFormReadyExecution = false;
  private hasExecutedFormReady = false;
  private compiledItems?: BehaviourCompiledItemsModule;
  private compiledTemplateEvaluator?: BehaviourCompiledTemplateEvaluator;

  constructor(
    private readonly behaviour: FormBehaviourConfigFrame,
    private readonly behaviourIndex: number,
    private readonly ctx: BehaviourHandlerContext
  ) {}

  /**
   * Activate a behaviour.
   *
   * Design summary from the implementation plan:
   * - validate `logical` targets up front
   * - subscribe synchronously before `FORM_DEFINITION_READY`
   * - debounce at the subscription boundary
   * - lazily load compiled templates only when execution is needed
   *
   * v1 limitation: all subscriptions are event-bus based; no separate transport,
   * hook extension point, or processor-specific debounce exists yet.
   */
  activate(): void {
    this.validateLogicalActions('actions', this.behaviour.actions ?? []);
    this.validateLogicalActions('onError', this.behaviour.onError ?? []);

    const observable = this.getEventObservable();
    const debounceMs = this.behaviour.debounceMs ?? 0;
    const source$ = debounceMs > 0 ? observable.pipe(debounceTime(debounceMs)) : observable;
    this.subscriptions.push(
      source$.subscribe(event => {
        void this.execute(event);
      })
    );
  }

  destroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions.length = 0;
    this.logicalFieldEntries.clear();
  }

  /**
   * Choose the broadest safe event stream for the configured condition type.
   *
   * JSONPointer conditions can often subscribe narrowly to a specific event type,
   * while JSONata-based conditions must see the broader event stream because the
   * match depends on runtime context.
   */
  private getEventObservable(): Observable<FormComponentEvent> {
    const conditionKind = this.behaviour.conditionKind ?? ExpressionsConditionKind.JSONPointer;
    if (conditionKind === ExpressionsConditionKind.JSONPointer) {
      const pointerCondition = getEventJSONPointerCondition(this.behaviour.condition || '');
      if (pointerCondition.event !== '*' && pointerCondition.event !== FormComponentEventType.FORM_DEFINITION_READY) {
        return this.ctx.eventBus.select$(pointerCondition.event as keyof FormComponentEventMap);
      }
    }
    return this.ctx.eventBus.selectAll$();
  }

  /**
   * Execute one behaviour pipeline for a matching event.
   *
   * Execution order is intentionally strict and sequential:
   * 1. match condition
   * 2. run processors in order
   * 3. run actions in order
   * 4. on failure, run `onError` actions and halt the normal pipeline
   */
  private async execute(event: FormComponentEvent): Promise<void> {
    const isFormReadyEvent = event.type === FormComponentEventType.FORM_DEFINITION_READY;
    // Once a runOnFormReady behaviour has completed its initial load pipeline,
    // block ALL subsequent events — not just FORM_DEFINITION_READY re-entries.
    // Without this, a broadcast event (sourceId="*") emitted by the action
    // passes the JSONata guard and restarts the pipeline indefinitely.
    if (this.hasExecutedFormReady) {
      return;
    }

    // Guard against synchronous self-feedback loops triggered while processing
    // the initial form-ready execution. This allows a form-ready behaviour to
    // publish broadcast events for downstream consumers without recursively
    // retriggering itself before the initial load pipeline completes.
    if (this.isProcessingFormReadyExecution && event.sourceId === '*') {
      return;
    }

    if (isFormReadyEvent) {
      this.isProcessingFormReadyExecution = true;
    }
    try {
      const condition = this.behaviour.condition;
      const conditionKind = this.behaviour.conditionKind ?? ExpressionsConditionKind.JSONPointer;
      const compiledTemplateEvaluator = await this.getCompiledTemplateEvaluator();
      const requestParams = (this.ctx.formComponent.requestParams?.() ?? {}) as Record<string, unknown>;

      const matches = await matchBehaviourCondition(condition, conditionKind, event, this.behaviour, {
        behaviourIndex: this.behaviourIndex,
        compiledTemplateEvaluator,
        formValue: (this.ctx.formComponent.form?.value ?? {}) as Record<string, unknown>,
        requestParams,
        querySource: this.getEventQuerySource(event),
      });

      if (!matches) {
        return;
      }

      let value = (event as { value?: unknown }).value;
      for (const [processorIndex, processor] of (this.behaviour.processors ?? []).entries()) {
        value = await executeBehaviourProcessor(processor, this.buildPipelineContext(value, event), {
          behaviourIndex: this.behaviourIndex,
          processorIndex,
          compiledTemplateEvaluator: this.compiledTemplateEvaluator,
          recordService: this.ctx.recordService,
          logger: this.ctx.logger,
          metadataCache: this.metadataCache,
        });
      }

      await this.executeActions('actions', this.behaviour.actions ?? [], value, event);
      if (isFormReadyEvent) {
        this.hasExecutedFormReady = true;
      }
    } catch (error) {
      this.ctx.logger.error('BehaviourHandler: Behaviour execution failed.', {
        error,
        behaviour: this.behaviour.name,
      });
      await this.executeActions('onError', this.behaviour.onError ?? [], (event as { value?: unknown }).value, event);
      if (isFormReadyEvent) {
        this.hasExecutedFormReady = true;
      }
    } finally {
      if (isFormReadyEvent) {
        this.isProcessingFormReadyExecution = false;
      }
    }
  }

  /**
   * Execute either the main action list or the `onError` fallback list.
   */
  private async executeActions(
    listName: 'actions' | 'onError',
    actions: FormBehaviourActionConfig[],
    value: unknown,
    event: FormComponentEvent
  ): Promise<void> {
    let hasSilentSetValueUpdate = false;
    for (const [actionIndex, action] of actions.entries()) {
      const actionKey = this.buildActionKey(listName, actionIndex);
      if (this.permanentlySkippedActions.has(actionKey)) {
        continue;
      }
      const didSilentlyUpdate = await executeBehaviourAction(action, this.buildPipelineContext(value, event), {
        behaviourIndex: this.behaviourIndex,
        actionIndex,
        listName,
        eventBus: this.ctx.eventBus,
        compiledTemplateEvaluator: this.compiledTemplateEvaluator,
        logger: this.ctx.logger,
        fieldResolverContext: { formComponent: this.ctx.formComponent },
        getLogicalFieldEntry: (targetListName, targetActionIndex) =>
          this.logicalFieldEntries.get(this.buildActionKey(targetListName, targetActionIndex)),
      });
      hasSilentSetValueUpdate ||= didSilentlyUpdate;
    }
    if (hasSilentSetValueUpdate) {
      this.ctx.formComponent.queueFormStatusBroadcast();
    }
  }

  /**
   * Build the pipeline context shared by processors and actions.
   *
   * This intentionally mirrors the expression runtime shape so JSONata templates
   * can be authored against familiar names such as `value`, `event`, `formData`,
   * `requestParams`, and `runtimeContext`.
   */
  private buildPipelineContext(value: unknown, event: FormComponentEvent): BehaviourPipelineContext {
    const requestParams = (this.ctx.formComponent.requestParams?.() ?? {}) as Record<string, unknown>;
    const querySource = this.ctx.formComponent.getQuerySource();
    return {
      value,
      event,
      formData: (this.ctx.formComponent.form?.value ?? {}) as Record<string, unknown>,
      requestParams,
      runtimeContext: (querySource?.runtimeContext ?? { requestParams }) as Record<string, unknown>,
      querySource: querySource?.querySource,
    };
  }

  private getEventQuerySource(event: FormComponentEvent) {
    const querySource = this.ctx.formComponent.getQuerySource();
    if (!querySource) {
      return undefined;
    }
    return {
      ...querySource,
      event,
    };
  }

  /**
   * Lazily create the behaviour-specific compiled template evaluator.
   */
  private async getCompiledTemplateEvaluator(): Promise<BehaviourCompiledTemplateEvaluator> {
    if (!this.compiledItems) {
      this.compiledItems = await this.ctx.formComponent.getFormCompiledItems();
    }
    if (!this.compiledTemplateEvaluator) {
      this.compiledTemplateEvaluator = new BehaviourCompiledTemplateEvaluator(this.compiledItems!, this.ctx.logger);
    }
    return this.compiledTemplateEvaluator;
  }

  /**
   * Enforce the v1 `logical` targeting rules at bind time.
   *
   * Scope and limitations:
   * - only `actions` may use `logical`
   * - the target must live inside a repeatable element
   * - invalid logical actions are permanently skipped for the lifetime of the
   *   handler rather than retried on every event
   */
  private validateLogicalActions(listName: 'actions' | 'onError', actions: FormBehaviourActionConfig[]): void {
    actions.forEach((action, actionIndex) => {
      if (action.type !== 'setValue' || action.config.fieldPathKind !== FieldPathKind.Logical) {
        return;
      }

      const actionKey = this.buildActionKey(listName, actionIndex);
      if (listName === 'onError') {
        this.ctx.logger.warn(
          'BehaviourHandler: logical fieldPathKind is not supported in onError actions and will be skipped.',
          {
            behaviour: this.behaviour.name,
            actionIndex,
          }
        );
        this.permanentlySkippedActions.add(actionKey);
        return;
      }

      const resolved = resolveFieldByPointer(action.config.fieldPath, { formComponent: this.ctx.formComponent });
      if (!resolved || !isRepeatableFieldEntry(resolved.entry)) {
        this.ctx.logger.warn(
          'BehaviourHandler: logical fieldPathKind must target a repeatable field and will be skipped.',
          {
            behaviour: this.behaviour.name,
            actionIndex,
            fieldPath: action.config.fieldPath,
          }
        );
        this.permanentlySkippedActions.add(actionKey);
        return;
      }

      this.logicalFieldEntries.set(actionKey, resolved.entry);
    });
  }

  private buildActionKey(listName: 'actions' | 'onError', actionIndex: number): string {
    return `${listName}:${actionIndex}`;
  }
}
