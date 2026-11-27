import { concatMap, debounceTime, filter, map, Observable, Subscription, tap } from 'rxjs';
import {
  ExpressionsConditionKind,
  FieldPathKind,
  FormBehaviourActionConfig,
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
import { BehaviourPipelineContext, executeBehaviourProcessor } from './behaviour-processors';
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
  private readonly subscriptions: Subscription[] = [];
  private readonly logicalFieldEntries = new Map<string, FormFieldCompMapEntry>();
  private readonly permanentlySkippedActions = new Set<string>();
  private readonly metadataCache = new Map<string, unknown>();
  private isProcessingFormReadyExecution = false;
  private readonly selections = new Map<string | undefined, RecordSelection>();
  private readonly pendingMetadataLoads = new Set<BehaviourWork>();
  private queuedMetadataLoad?: BehaviourWork;
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
    const fetchesMetadata = this.fetchesMetadata();
    const candidates = (fetchesMetadata ? observable.pipe(filter(event => this.canHandleMetadataEvent(event))) : observable)
      .pipe(map(event => ({ event, selection: fetchesMetadata ? this.selectRecord(event) : undefined })));
    const debounceMs = this.behaviour.debounceMs ?? 0;
    const matchesBeforeDebounce = debounceMs > 0 && fetchesMetadata;
    const eligibleWork = matchesBeforeDebounce ? candidates.pipe(
      tap(work => this.pendingMetadataLoads.add(work)),
      concatMap(async work => {
        try {
          if (!await this.matches(work)) return null;
          this.queuedMetadataLoad = work;
          return work;
        } catch (error) {
          await this.handleExecutionError(error, work);
          return null;
        } finally {
          this.pendingMetadataLoads.delete(work);
        }
      }),
      filter(work => work !== null)
    ) : candidates;
    const source$ = debounceMs > 0 ? eligibleWork.pipe(debounceTime(debounceMs)) : eligibleWork;
    this.subscriptions.push(
      source$.subscribe(work => {
        if (this.queuedMetadataLoad === work) this.queuedMetadataLoad = undefined;
        void this.execute(work, matchesBeforeDebounce);
      })
    );
  }

  destroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions.length = 0;
    this.queuedMetadataLoad = undefined;
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
      if (pointerCondition.event !== '*' && pointerCondition.event !== FormComponentEventType.FORM_DEFINITION_READY) {
        return this.ctx.eventBus.select$(pointerCondition.event as keyof FormComponentEventMap);
      }
    }
    return this.ctx.eventBus.selectAll$();
  }

  private fetchesMetadata(): boolean {
    return this.behaviour.processors?.some(processor => processor.type === FormBehaviourProcessorType.FetchMetadata) ?? false;
  }

  private canHandleMetadataEvent(event: FormComponentEvent): boolean {
    if (this.hasExecutedFormReady || (this.isProcessingFormReadyExecution && event.sourceId === '*')) return false;
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

  private isCurrent(work: BehaviourWork): boolean {
    return !work.selection || this.selections.get(work.event.fieldId) === work.selection;
  }

  private async matches(work: BehaviourWork): Promise<boolean> {
    if (!this.isCurrent(work)) return false;
    const { event, selection } = work;
    const matched = await matchBehaviourCondition(
      this.behaviour.condition, this.behaviour.conditionKind ?? ExpressionsConditionKind.JSONPointer, event, this.behaviour, {
        behaviourIndex: this.behaviourIndex,
        getCompiledTemplateEvaluator: () => this.getCompiledTemplateEvaluator(),
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
    const fetchesMetadata = this.fetchesMetadata();
    if (fetchesMetadata) this.pendingMetadataLoads.add(work);
    try {
      if (!conditionMatched && !await this.matches(work)) return;

      await this.getCompiledTemplateEvaluator();
      const selectedOid = selection?.oid;
      let value = (event as { value?: unknown }).value;
      let recordImport: FieldValueChangedEvent['recordImport'] = fetchesMetadata ? 'no-import' : undefined;
      for (const [processorIndex, processor] of (this.behaviour.processors ?? []).entries()) {
        if (!this.isCurrent(work)) return;
        if (processor.type === FormBehaviourProcessorType.FetchMetadata && typeof value === 'string' && value.trim()) {
          recordImport = selectedOid === value.trim()
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
      }

      if (!this.isCurrent(work)) return;
      await this.executeActions('actions', this.behaviour.actions ?? [], value, work, recordImport);
      if (selection && this.isCurrent(work)) selection.needsImport = false;
      if (isFormReadyEvent) {
        this.hasExecutedFormReady = true;
      }
    } catch (error) {
      await this.handleExecutionError(error, work);
      if (isFormReadyEvent) {
        this.hasExecutedFormReady = true;
      }
    } finally {
      if (fetchesMetadata) this.pendingMetadataLoads.delete(work);
      if (isFormReadyEvent) {
        this.isProcessingFormReadyExecution = false;
      }
    }
  }

  private async handleExecutionError(error: unknown, work: BehaviourWork): Promise<void> {
    if (!this.isCurrent(work)) return;
    this.ctx.logger.error('BehaviourHandler: Behaviour execution failed.', {
      error,
      behaviour: this.behaviour.name,
    });
    await this.executeActions('onError', this.behaviour.onError ?? [], (work.event as { value?: unknown }).value, work);
  }

  get isLoadingMetadata(): boolean {
    return (!!this.queuedMetadataLoad && this.isCurrent(this.queuedMetadataLoad)) ||
      Array.from(this.pendingMetadataLoads).some(work => this.isCurrent(work));
  }

  get hasPendingRecordImport(): boolean {
    return Array.from(this.selections.values()).some(selection => selection.needsImport);
  }

  /**
   * Execute either the main action list or the `onError` fallback list.
   */
  private async executeActions(
    listName: 'actions' | 'onError',
    actions: FormBehaviourActionConfig[],
    value: unknown,
    work: BehaviourWork,
    recordImport?: FieldValueChangedEvent['recordImport']
  ): Promise<void> {
    for (const [actionIndex, action] of actions.entries()) {
      if (!this.isCurrent(work)) return;
      const actionKey = this.buildActionKey(listName, actionIndex);
      if (this.permanentlySkippedActions.has(actionKey)) {
        continue;
      }
      await executeBehaviourAction(action, this.buildPipelineContext(value, work.event), {
        behaviourIndex: this.behaviourIndex,
        actionIndex,
        listName,
        eventBus: this.ctx.eventBus,
        recordImport,
        isCurrent: work.selection ? () => this.isCurrent(work) : undefined,
        compiledTemplateEvaluator: this.compiledTemplateEvaluator,
        logger: this.ctx.logger,
        broadcastFormStatus: () => this.ctx.formComponent.broadcastFormStatus(),
        fieldResolverContext: { formComponent: this.ctx.formComponent },
        getLogicalFieldEntry: (targetListName, targetActionIndex) =>
          this.logicalFieldEntries.get(this.buildActionKey(targetListName, targetActionIndex)),
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
