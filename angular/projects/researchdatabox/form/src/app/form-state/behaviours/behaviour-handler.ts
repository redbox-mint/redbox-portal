import { RelatedDataWorkScope } from '../related-records/related-data-state.service';
import { concatMap, debounceTime, filter, groupBy, map, mergeMap, Observable, Subscription, tap } from 'rxjs';
import {
  ExpressionsConditionKind,
  FieldPathKind,
  FormBehaviourActionConfig,
  FormBehaviourActionType,
  FormBehaviourConfigFrame,
  FormBehaviourProcessorType,
} from '@researchdatabox/sails-ng-common';
import { FormFieldCompMapEntry, LoggerService, RecordService } from '@researchdatabox/portal-ng-common';
import { FormComponent } from '../../form.component';
import { FormComponentEventBus } from '../events/form-component-event-bus.service';
import {
  FieldValueChangedEvent,
  FormComponentEvent,
  FormComponentEventMap,
  FormComponentEventType,
} from '../events/form-component-event.types';
import {
  BehaviourCompiledItemsModule,
  BehaviourCompiledTemplateEvaluator,
} from './behaviour-compiled-template-evaluator';
import { isRepeatableFieldEntry, resolveFieldByPointer } from './behaviour-field-resolver';
import { canMatchJSONataEvent, matchBehaviourCondition, matchJSONPointerCondition } from './behaviour-condition-matcher';
import { BehaviourPipelineContext, BehaviourReservedContextKeys, executeBehaviourProcessor } from './behaviour-processors';
import { executeBehaviourAction } from './behaviour-actions';
import { getEventJSONPointerCondition } from '../events/form-component-base-event-producer-consumer';

function selectedRecordOid(selection: unknown): string {
  let id = selection;
  if (selection && typeof selection === 'object') {
    const reference = selection as { oid?: unknown; redboxOid?: unknown };
    id = reference.oid ?? reference.redboxOid;
  }
  return typeof id === 'string' ? id.trim() : '';
}

type RecordSelection = { oid: string; needsImport: boolean };
type BehaviourWork = {
  event: FormComponentEvent;
  selection?: RecordSelection;
};

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
  private static nextHandlerId = 0;
  private readonly handlerId = BehaviourHandler.nextHandlerId++;
  private readonly subscriptions: Subscription[] = [];
  private readonly logicalFieldEntries = new Map<string, FormFieldCompMapEntry>();
  private readonly permanentlySkippedActions = new Set<string>();
  private readonly metadataCache = new Map<string, unknown>();
  private readonly work = new RelatedDataWorkScope();
  private isActive = true;
  private isProcessingFormReadyExecution = false;
  private readonly selections = new Map<string | undefined, RecordSelection>();
  private readonly pendingMetadataLoads = new Set<BehaviourWork>();
  private readonly queuedMetadataLoads = new Map<string | undefined, BehaviourWork>();
  private hasExecutedFormReady = false;
  private failedInitialImport?: BehaviourWork;
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
    if (!this.isActive) return;
    this.validateActions('actions', this.behaviour.actions ?? []);
    this.validateActions('onError', this.behaviour.onError ?? []);

    const observable = this.getEventObservable().pipe(filter(event =>
      (!event.formScopeId || event.formScopeId === this.ctx.formComponent.eventScopeId) &&
      !event.behaviourChain?.includes(this.handlerId)
    ));
    const fetchesMetadata = this.fetchesMetadata();
    const candidates = (fetchesMetadata ? observable.pipe(filter(event => this.canHandleMetadataEvent(event))) : observable)
      .pipe(map(event => ({ event, selection: fetchesMetadata ? this.selectRecord(event) : undefined })));
    const debounceMs = this.behaviour.debounceMs ?? 0;
    const matchesBeforeDebounce = debounceMs > 0 && fetchesMetadata;
    const waiting = new Map<string | undefined, () => void>();
    const tracked = candidates.pipe(tap(work => {
      if (fetchesMetadata) return;
      const key = work.event.type === FormComponentEventType.FORM_DEFINITION_READY ? 'ready' : undefined;
      waiting.get(key)?.();
      waiting.set(key, this.work.begin(this.ctx.formComponent.relatedDataState));
    }));
    const metadataReservations = new Map<BehaviourWork, () => void>();
    const releaseMetadata = (work: BehaviourWork) => {
      const release = metadataReservations.get(work);
      metadataReservations.delete(work);
      release?.();
    };
    const eligibleWork = matchesBeforeDebounce ? candidates.pipe(
      tap(work => {
        this.pendingMetadataLoads.add(work);
        metadataReservations.set(work, this.work.begin(this.ctx.formComponent.relatedDataState));
      }),
      concatMap(async work => {
        try {
          if (!await this.matches(work)) return null;
          const key = this.metadataDebounceKey(work);
          const superseded = this.queuedMetadataLoads.get(key);
          this.queuedMetadataLoads.set(key, work);
          if (superseded) releaseMetadata(superseded);
          return work;
        } catch (error) {
          await this.handleExecutionError(error, work);
          return null;
        } finally {
          this.pendingMetadataLoads.delete(work);
          if (this.queuedMetadataLoads.get(this.metadataDebounceKey(work)) !== work) releaseMetadata(work);
        }
      }),
      filter(work => work !== null)
    ) : tracked;
    const source$ = matchesBeforeDebounce ? eligibleWork.pipe(
      groupBy(work => this.metadataDebounceKey(work)),
      mergeMap(group => group.pipe(debounceTime(debounceMs)))
    ) : debounceMs > 0 ? eligibleWork.pipe(
      groupBy(work => work.event.type === FormComponentEventType.FORM_DEFINITION_READY),
      mergeMap(events => events.pipe(debounceTime(debounceMs)))
    ) : eligibleWork;
    this.subscriptions.push(
      source$.subscribe(work => {
        const key = this.metadataDebounceKey(work);
        if (this.queuedMetadataLoads.get(key) === work) this.queuedMetadataLoads.delete(key);
        const waitingKey = work.event.type === FormComponentEventType.FORM_DEFINITION_READY ? 'ready' : undefined;
        const release = waiting.get(waitingKey);
        waiting.delete(waitingKey);
        const releaseImmediateMetadata = fetchesMetadata && !matchesBeforeDebounce
          ? this.work.begin(this.ctx.formComponent.relatedDataState)
          : undefined;
        void this.execute(work, matchesBeforeDebounce).finally(() => {
          release?.();
          releaseMetadata(work);
          releaseImmediateMetadata?.();
        });
      })
    );
  }

  destroy(): void {
    // In-flight processors and templates must also stop when the record is replaced.
    this.isActive = false;
    this.work.cancel();
    this.failedInitialImport = undefined;
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions.length = 0;
    this.queuedMetadataLoads.clear();
    this.selections.clear();
    this.pendingMetadataLoads.clear();
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
      if (pointerCondition.event !== '*') {
        return this.ctx.eventBus.select$(pointerCondition.event as keyof FormComponentEventMap);
      }
    }
    return this.ctx.eventBus.selectAll$();
  }

  private fetchesMetadata(): boolean {
    return this.behaviour.processors?.some(processor => processor.type === FormBehaviourProcessorType.FetchMetadata) ?? false;
  }

  private canHandleMetadataEvent(event: FormComponentEvent): boolean {
    if ((this.behaviour.runOnFormReady === true && this.hasExecutedFormReady) || this.failedInitialImport ||
        (this.isProcessingFormReadyExecution && event.sourceId === '*')) return false;
    const kind = this.behaviour.conditionKind ?? ExpressionsConditionKind.JSONPointer;
    return kind === ExpressionsConditionKind.JSONPointer
      ? matchJSONPointerCondition(this.behaviour.condition, event, this.behaviour, this.getEventQuerySource(event))
      : canMatchJSONataEvent(event, this.behaviour);
  }

  private selectRecord(event: FormComponentEvent): RecordSelection | undefined {
    if (event.type !== FormComponentEventType.FIELD_VALUE_CHANGED) return undefined;
    const oid = selectedRecordOid(event.value);
    const previousOid = selectedRecordOid(event.previousValue);
    const previous = this.selections.get(event.fieldId);
    if (!oid && !previousOid && !previous) return undefined;

    const selection = {
      oid,
      // A same-OID retry or reselection during debounce carries the original import intent.
      needsImport: !!oid && (oid !== previousOid || (previous?.oid === oid && previous.needsImport)),
    };
    this.selections.set(event.fieldId, selection);
    return selection;
  }

  private metadataDebounceKey(work: BehaviourWork): string | undefined {
    return work.selection ? work.event.fieldId : undefined;
  }

  private isCurrent(work: BehaviourWork): boolean {
    return this.isActive && work.event.isCurrent?.() !== false &&
      (!work.selection || this.selections.get(work.event.fieldId) === work.selection);
  }

  private async matches(work: BehaviourWork): Promise<boolean> {
    if (!this.isCurrent(work)) return false;
    const { event, selection } = work;
    const matched = await matchBehaviourCondition(
      this.behaviour.condition, this.behaviour.conditionKind ?? ExpressionsConditionKind.JSONPointer, event, this.behaviour, {
        behaviourIndex: this.behaviourIndex,
        compiledTemplateEvaluator: await this.getCompiledTemplateEvaluator(),
        formValue: (this.ctx.formComponent.form?.value ?? {}) as Record<string, unknown>,
        requestParams: (this.ctx.formComponent.requestParams?.() ?? {}) as Record<string, unknown>,
        querySource: this.getEventQuerySource(event),
      }
    );
    if (!this.isCurrent(work)) return false;
    // A false condition settles the selection. An exception leaves it available for retry.
    if (!matched && selection) selection.needsImport = false;
    return matched;
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
  private async execute(work: BehaviourWork, conditionMatched: boolean): Promise<void> {
    if (!this.isCurrent(work)) return;
    const { event, selection } = work;
    const isFormReadyEvent = event.type === FormComponentEventType.FORM_DEFINITION_READY;
    const runsOnlyOnFormReady = this.behaviour.runOnFormReady === true;
    if ((runsOnlyOnFormReady && this.hasExecutedFormReady) ||
        (this.failedInitialImport && this.failedInitialImport !== work)) {
      return;
    }

    // Guard against synchronous self-feedback loops triggered while processing
    // the initial form-ready execution. This allows a form-ready behaviour to
    // publish broadcast events for downstream consumers without recursively
    // retriggering itself before the initial load pipeline completes.
    if (runsOnlyOnFormReady && this.isProcessingFormReadyExecution && event.sourceId === '*') {
      return;
    }

    const fetchesMetadata = this.fetchesMetadata();
    if (fetchesMetadata) this.pendingMetadataLoads.add(work);
    try {
      if (!conditionMatched && !await this.matches(work)) {
        if (this.failedInitialImport === work) this.failedInitialImport = undefined;
        return;
      }
      if (runsOnlyOnFormReady && this.hasExecutedFormReady) return;
      const conditionKind = this.behaviour.conditionKind ?? ExpressionsConditionKind.JSONPointer;
      if (isFormReadyEvent) this.isProcessingFormReadyExecution = true;
      const reservedReady = runsOnlyOnFormReady && (isFormReadyEvent ||
        conditionKind === ExpressionsConditionKind.JSONata || conditionKind === ExpressionsConditionKind.JSONataQuery);
      if (reservedReady) this.hasExecutedFormReady = true;
      await this.getCompiledTemplateEvaluator();
      const selectedOid = selection?.oid;
      let value = (event as { value?: unknown }).value;
      let recordImport: FieldValueChangedEvent['recordImport'] = fetchesMetadata ? 'no-import' : undefined;
      for (const [processorIndex, processor] of (this.behaviour.processors ?? []).entries()) {
        if (!this.isCurrent(work)) return;
        if (processor.type === FormBehaviourProcessorType.FetchMetadata && typeof value === 'string' && value.trim()) {
          recordImport = isFormReadyEvent ? 'changed-selection' : selectedOid === value.trim()
            ? (selection?.needsImport ? 'changed-selection' : 'same-selection')
            : 'metadata-refresh';
        }
        value = await executeBehaviourProcessor(processor, this.buildPipelineContext(value, event), {
          behaviourIndex: this.behaviourIndex,
          processorIndex,
          compiledTemplateEvaluator: this.compiledTemplateEvaluator,
          recordService: this.ctx.recordService,
          logger: this.ctx.logger,
          metadataCache: this.metadataCache,
        });
        if (!this.isActive || event.isCurrent?.() === false) return;
      }

      if (!this.isCurrent(work)) return;
      await this.executeActions('actions', this.behaviour.actions ?? [], value, work, recordImport);
      if (!this.isCurrent(work)) return;
      if (selection) selection.needsImport = false;
      if (isFormReadyEvent) {
        this.failedInitialImport = undefined;
        this.hasExecutedFormReady = true;
      }
    } catch (error) {
      if (isFormReadyEvent && fetchesMetadata) this.hasExecutedFormReady = false;
      await this.handleExecutionError(error, work);
    } finally {
      if (fetchesMetadata) this.pendingMetadataLoads.delete(work);
      if (isFormReadyEvent) {
        this.isProcessingFormReadyExecution = false;
      }
    }
  }

  private async handleExecutionError(error: unknown, work: BehaviourWork): Promise<void> {
    if (!this.isCurrent(work)) return;
    if (this.fetchesMetadata() && work.event.type === FormComponentEventType.FORM_DEFINITION_READY) {
      this.failedInitialImport = work;
    }
    this.ctx.logger.error('BehaviourHandler: Behaviour execution failed.', {
      error,
      behaviour: this.behaviour.name,
    });
    await this.executeActions('onError', this.behaviour.onError ?? [], (work.event as { value?: unknown }).value, work);
  }

  get isLoadingMetadata(): boolean {
    return Array.from(this.queuedMetadataLoads.values()).some(work => this.isCurrent(work)) ||
      Array.from(this.pendingMetadataLoads).some(work => this.isCurrent(work));
  }

  get hasFailedInitialImport(): boolean {
    return this.failedInitialImport !== undefined;
  }

  get hasPendingRecordImport(): boolean {
    return this.hasFailedInitialImport || Array.from(this.selections.values()).some(selection => selection.needsImport);
  }

  async retryInitialImport(): Promise<void> {
    if (this.failedInitialImport && !this.isLoadingMetadata) {
      const release = this.work.begin(this.ctx.formComponent.relatedDataState);
      try {
        await this.execute(this.failedInitialImport, false);
      } finally {
        release();
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
    work: BehaviourWork,
    recordImport?: FieldValueChangedEvent['recordImport']
  ): Promise<void> {
    const event = work.event;
    const state = { value, extras: {} as Record<string, unknown> };
    for (const [actionIndex, action] of actions.entries()) {
      if (!this.isCurrent(work)) return;
      const actionKey = this.buildActionKey(listName, actionIndex);
      if (this.permanentlySkippedActions.has(actionKey)) {
        continue;
      }
      const pipelineContext = { ...this.buildPipelineContext(state.value, event), ...state.extras };
      await executeBehaviourAction(action, pipelineContext, {
        behaviourIndex: this.behaviourIndex,
        behaviourChain: [...(event.behaviourChain ?? []), this.handlerId],
        expressionChain: event.expressionChain,
        actionIndex,
        listName,
        eventBus: this.ctx.eventBus,
        recordImport,
        compiledTemplateEvaluator: this.compiledTemplateEvaluator,
        logger: this.ctx.logger,
        isActive: () => this.isCurrent(work),
        broadcastFormStatus: () => {
          if (this.isCurrent(work)) this.ctx.formComponent.broadcastFormStatus();
        },
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
      // Use the record's current workflow-stage form (oid-aware) so behaviour/expression keys
      // match the rendered form; stage forms can differ structurally from the starting-step form.
      this.compiledItems = await this.ctx.formComponent.getRecordCompiledItems();
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
   *   `setUIProperty`, and `setUIProperties` (each entry's effective field
   *   path, whether inherited or owned): only `actions` may use `logical`,
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
          action.config.properties.forEach((entry, entryIndex) => {
            const usesOwnFieldPath = entry.fieldPath !== undefined || entry.hasFieldPathTemplate === true;
            this.validateLogicalEntry(listName, actionIndex, entryIndex, usesOwnFieldPath ? entry : action.config);
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
