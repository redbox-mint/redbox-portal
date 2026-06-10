import { debounceTime, Observable, Subscription } from 'rxjs';
import {
  ExpressionsConditionKind,
  FieldPathKind,
  FormBehaviourActionConfig,
  FormBehaviourActionType,
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
import { BehaviourPipelineContext, BehaviourReservedContextKeys, executeBehaviourProcessor } from './behaviour-processors';
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
    this.validateActions('actions', this.behaviour.actions ?? []);
    this.validateActions('onError', this.behaviour.onError ?? []);

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
    // A behaviour configured to run *only* on form ready (runOnFormReady === true)
    // must not re-run for any later event. Once its initial load pipeline completes,
    // block ALL subsequent events — not just FORM_DEFINITION_READY re-entries — so a
    // broadcast event (sourceId="*") emitted by the action cannot restart the pipeline.
    //
    // This guard is deliberately scoped to runOnFormReady === true. Event-driven
    // behaviours (runOnFormReady unset/false) may legitimately match the form-ready
    // event via a JSONata or "*" condition; blocking them here would permanently
    // silence every subsequent trigger for the rest of the form session.
    const runsOnlyOnFormReady = this.behaviour.runOnFormReady === true;
    if (runsOnlyOnFormReady && this.hasExecutedFormReady) {
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
   *
   * `state` lives for one list execution: `runTemplate` actions write the
   * pipeline `value` and named context extras into it so later actions can
   * read them, while the per-action context rebuild keeps `formData`
   * re-snapshotted after each mutation. Extras spread before reserved keys
   * could in principle collide, but bind-time validation rejects reserved
   * `resultKey`s, so reserved keys always come from the rebuilt context.
   */
  private async executeActions(
    listName: 'actions' | 'onError',
    actions: FormBehaviourActionConfig[],
    value: unknown,
    event: FormComponentEvent
  ): Promise<void> {
    const state = { value, extras: {} as Record<string, unknown> };
    for (const [actionIndex, action] of actions.entries()) {
      const actionKey = this.buildActionKey(listName, actionIndex);
      if (this.permanentlySkippedActions.has(actionKey)) {
        continue;
      }
      const pipelineContext = { ...this.buildPipelineContext(state.value, event), ...state.extras };
      await executeBehaviourAction(action, pipelineContext, {
        behaviourIndex: this.behaviourIndex,
        actionIndex,
        listName,
        eventBus: this.ctx.eventBus,
        compiledTemplateEvaluator: this.compiledTemplateEvaluator,
        logger: this.ctx.logger,
        broadcastFormStatus: () => this.ctx.formComponent.broadcastFormStatus(),
        fieldResolverContext: { formComponent: this.ctx.formComponent },
        getLogicalFieldEntry: (targetListName, targetActionIndex, targetEntryIndex) =>
          this.logicalFieldEntries.get(this.buildActionKey(targetListName, targetActionIndex, targetEntryIndex)),
        isEntrySkipped: (targetListName, targetActionIndex, targetEntryIndex) =>
          this.permanentlySkippedActions.has(this.buildActionKey(targetListName, targetActionIndex, targetEntryIndex)),
        updatePipelineValue: newValue => {
          state.value = newValue;
        },
        setPipelineContextKey: (key, newValue) => {
          state.extras[key] = newValue;
        },
      });
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
   * Validate actions at bind time.
   *
   * Checks applied:
   * - `logical` targeting rules for `setValue`, `setValues` entries,
   *   `setUIProperty`, and `setUIProperties` (action-level defaults and
   *   entries that own their field path): only `actions` may use `logical`,
   *   and the target must live inside a repeatable element
   * - `runTemplate` `resultKey` must be a valid identifier and must not
   *   shadow a reserved pipeline context key
   * - plural actions must have a non-empty `values`/`properties` list
   *
   * Invalid actions (or individual nested entries) are permanently skipped for
   * the lifetime of the handler rather than retried on every event.
   */
  private validateActions(listName: 'actions' | 'onError', actions: FormBehaviourActionConfig[]): void {
    actions.forEach((action, actionIndex) => {
      switch (action.type) {
        case FormBehaviourActionType.SetValue:
        case FormBehaviourActionType.SetUIProperty:
          this.validateLogicalEntry(listName, actionIndex, undefined, action.config);
          return;
        case FormBehaviourActionType.SetValues: {
          if (!this.validateEntryList(listName, actionIndex, 'values', action.config?.values)) {
            return;
          }
          action.config.values.forEach((entry, entryIndex) =>
            this.validateLogicalEntry(listName, actionIndex, entryIndex, entry)
          );
          return;
        }
        case FormBehaviourActionType.SetUIProperties: {
          if (!this.validateEntryList(listName, actionIndex, 'properties', action.config?.properties)) {
            return;
          }
          // Action-level defaults may be logical; an invalid default skips the
          // whole action because every inheriting entry would fail anyway.
          this.validateLogicalEntry(listName, actionIndex, undefined, action.config);
          action.config.properties.forEach((entry, entryIndex) => {
            if (entry.fieldPath !== undefined || entry.hasFieldPathTemplate === true) {
              this.validateLogicalEntry(listName, actionIndex, entryIndex, entry);
            }
          });
          return;
        }
        case FormBehaviourActionType.RunTemplate:
          this.validateRunTemplateAction(listName, actionIndex, action.config);
          return;
        default:
          return;
      }
    });
  }

  /**
   * Permanently skip plural actions whose entry list is missing or empty so
   * misconfiguration is reported once at bind time instead of silently
   * no-opping on every event.
   */
  private validateEntryList(
    listName: 'actions' | 'onError',
    actionIndex: number,
    entryListName: 'values' | 'properties',
    entries: unknown
  ): entries is unknown[] {
    if (Array.isArray(entries) && entries.length > 0) {
      return true;
    }
    this.ctx.logger.warn(`BehaviourHandler: action has a missing or empty '${entryListName}' list and will be skipped.`, {
      behaviour: this.behaviour.name,
      listName,
      actionIndex,
    });
    this.permanentlySkippedActions.add(this.buildActionKey(listName, actionIndex));
    return false;
  }

  /**
   * Enforce the `logical` targeting rules for one action config or nested
   * entry. `entryIndex` is undefined for whole-action configs; nested entries
   * get their own skip/lock keys so one bad entry does not disable siblings.
   */
  private validateLogicalEntry(
    listName: 'actions' | 'onError',
    actionIndex: number,
    entryIndex: number | undefined,
    entryConfig: { fieldPath?: string; fieldPathKind?: string }
  ): void {
    if (entryConfig.fieldPathKind !== FieldPathKind.Logical) {
      return;
    }

    const actionKey = this.buildActionKey(listName, actionIndex, entryIndex);
    if (listName === 'onError') {
      this.ctx.logger.warn(
        'BehaviourHandler: logical fieldPathKind is not supported in onError actions and will be skipped.',
        {
          behaviour: this.behaviour.name,
          actionIndex,
          entryIndex,
        }
      );
      this.permanentlySkippedActions.add(actionKey);
      return;
    }

    const resolved = entryConfig.fieldPath
      ? resolveFieldByPointer(entryConfig.fieldPath, { formComponent: this.ctx.formComponent })
      : undefined;
    if (!resolved || !isRepeatableFieldEntry(resolved.entry)) {
      this.ctx.logger.warn(
        'BehaviourHandler: logical fieldPathKind must target a repeatable field and will be skipped.',
        {
          behaviour: this.behaviour.name,
          actionIndex,
          entryIndex,
          fieldPath: entryConfig.fieldPath,
        }
      );
      this.permanentlySkippedActions.add(actionKey);
      return;
    }

    this.logicalFieldEntries.set(actionKey, resolved.entry);
  }

  /**
   * Validate a `runTemplate` action's `resultKey` at bind time. Invalid keys
   * permanently skip the whole action: predictable, and consistent with the
   * logical-kind handling above.
   */
  private validateRunTemplateAction(
    listName: 'actions' | 'onError',
    actionIndex: number,
    config: { resultKey?: string } | undefined
  ): void {
    const resultKey = config?.resultKey;
    if (resultKey === undefined) {
      return;
    }
    const isReserved = (BehaviourReservedContextKeys as readonly string[]).includes(resultKey);
    const isValidIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/.test(resultKey);
    if (isReserved || !isValidIdentifier) {
      this.ctx.logger.warn(
        'BehaviourHandler: runTemplate resultKey is reserved or not a valid identifier; action will be skipped.',
        {
          behaviour: this.behaviour.name,
          listName,
          actionIndex,
          resultKey,
        }
      );
      this.permanentlySkippedActions.add(this.buildActionKey(listName, actionIndex));
    }
  }

  private buildActionKey(listName: 'actions' | 'onError', actionIndex: number, entryIndex?: number): string {
    return entryIndex === undefined ? `${listName}:${actionIndex}` : `${listName}:${actionIndex}:entries:${entryIndex}`;
  }
}
