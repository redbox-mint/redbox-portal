import { Component, inject, Injector, Input, OnDestroy, runInInjectionContext } from '@angular/core';
import { Subscription, take } from 'rxjs';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import {
  ExpressionsConditionKind,
  FormExpressionsConfigFrame,
  RecordMetadataRetrieverComponentName,
} from '@researchdatabox/sails-ng-common';
import { FormComponent } from '../form.component';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { FormComponentEventBaseConsumer } from '../form-state/events/form-component-base-event-consumer';
import {
  createFieldValueChangedEvent,
  FieldValueChangedEvent,
  FormComponentEvent,
  FormComponentEventType,
} from '../form-state/events/form-component-event.types';
import { RecordService } from '@researchdatabox/portal-ng-common';
import {getEventJSONPointerCondition} from "../form-state";

interface MetadataCandidate {
  isCurrent: () => boolean;
  accept: () => MetadataRequest | undefined;
}

interface MetadataRequest {
  sequence: number;
  expression?: FormExpressionsConfigFrame;
  oid: string;
  lastFetchedOid?: string;
  failed: boolean;
  loading: boolean;
  isCurrent: () => boolean;
}

class RecordMetadataRetrieverExpressionConsumer extends FormComponentEventBaseConsumer {
  protected override readonly consumedEventType = FormComponentEventType.FIELD_VALUE_CHANGED;

  constructor(
    eventBus: FormComponentEventBus,
    private readonly handler: (event: FormComponentEvent, expression: FormExpressionsConfigFrame, request: MetadataRequest) => Promise<void>,
    private readonly candidate: (event: FormComponentEvent, expression: FormExpressionsConfigFrame) => MetadataCandidate | undefined,
    private readonly finish: (request: MetadataRequest) => void
  ) {
    super(eventBus);
  }

  override bind(options: {
    component: RecordMetadataRetrieverComponent;
    definition: NonNullable<RecordMetadataRetrieverComponent['formFieldCompMapEntry']>;
    formComponent: FormComponent;
  }): void {
    this.destroy();
    this.options = options;
    this.expressions = options.definition.expressions;
    this.formComponent = options.formComponent;
    this.setupQuerySourceUpdateListener();

    this.subscriptions.set(
      FormComponentEventType.FIELD_VALUE_CHANGED,
      this.eventBus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe((event) => {
        this.consumeMatchedExpressions(event).catch((err) => this.handleConsumeError(err));
      })
    );
  }

  protected override async consumeEvent(event: FormComponentEvent, expression: FormExpressionsConfigFrame): Promise<void> {
    const request = this.candidate(event, expression)?.accept();
    if (!request?.isCurrent()) return;
    try {
      await this.handler(event, expression, request);
    } finally {
      this.finish(request);
    }
  }

  public async evaluateTemplateExpression(
    expression: FormExpressionsConfigFrame,
    event: FormComponentEvent
  ): Promise<unknown> {
    return this.evaluateExpressionJSONata(expression, event, 'template');
  }

  protected override evaluateExpressionJSONata(
    expression: FormExpressionsConfigFrame,
    event: FormComponentEvent,
    propertyName: string,
    additionalData: object = {}
  ): Promise<unknown> {
    // Failed conditions must never become matches merely because an OID is truthy.
    return super.evaluateExpressionJSONata(expression, event, propertyName, additionalData,
      propertyName === 'condition' ? false : (event as { value?: unknown }).value);
  }

  private handleConsumeError(err: unknown): void {
    console.error('RecordMetadataRetrieverExpressionConsumer: Error consuming matched expressions.', err);
  }

  private async consumeMatchedExpressions(event: FormComponentEvent): Promise<void> {
    // Candidates do not replace accepted work until their condition matches. Compare
    // arrival order with accepted requests so a late older match cannot take over.
    await Promise.all((this.expressions ?? []).map(async expression => {
      const candidate = this.candidate(event, expression);
      if (!candidate?.isCurrent()) return;
      const matched = await this.getMatchedExpressions(event, [expression]);
      if (!candidate.isCurrent() || !matched?.length) return;
      const request = candidate.accept();
      if (!request?.isCurrent()) return;
      try {
        await this.handler(event, expression, request);
      } finally {
        this.finish(request);
      }
    }));
  }
}

@Component({
  selector: 'redbox-record-metadata-retriever',
  template: `
    <div *ngIf="metadataLoadWarning" class="alert alert-warning" role="status" aria-live="polite">
      Related record metadata could not be loaded. Existing field values have been kept and may be incomplete.
      <button type="button" class="btn btn-default" (click)="retryMetadata()" [disabled]="metadataLoading">Retry loading metadata</button>
    </div>`,
  standalone: false,
})
export class RecordMetadataRetrieverComponent extends FormFieldBaseComponent<never> implements OnDestroy {
  protected override logName = RecordMetadataRetrieverComponentName;

  @Input() public override model?: never;

  private readonly injector = inject(Injector);
  private readonly recordService = inject(RecordService);
  private readonly eventBus = inject(FormComponentEventBus);
  private expressionConsumer?: RecordMetadataRetrieverExpressionConsumer;
  private formReadyExpressionSubscription?: Subscription;
  public metadataLoadWarning = false;
  public metadataLoading = false;
  private destroyed = false;
  private requestSequence = 0;
  private readonly metadataRequests = new Map<FormExpressionsConfigFrame | undefined, MetadataRequest>();

  private createCandidate(event: FormComponentEvent, expression: FormExpressionsConfigFrame): MetadataCandidate | undefined {
    if (this.destroyed || !this.shouldHandleExpression(event, expression)) return undefined;
    const sequence = ++this.requestSequence;
    const isCurrent = () => !this.destroyed && (this.metadataRequests.get(expression)?.sequence ?? 0) < sequence;
    return {
      isCurrent,
      accept: () => isCurrent() ? this.beginRequest(expression, sequence) : undefined,
    };
  }

  private beginRequest(expression?: FormExpressionsConfigFrame, sequence = ++this.requestSequence): MetadataRequest {
    const previous = this.metadataRequests.get(expression);
    const request: MetadataRequest = {
      sequence, expression, oid: previous?.oid ?? '', lastFetchedOid: previous?.lastFetchedOid,
      failed: previous?.failed ?? false, loading: true,
      isCurrent: () => !this.destroyed && this.metadataRequests.get(expression) === request,
    };
    this.metadataRequests.set(expression, request);
    this.updateMetadataStatus();
    return request;
  }

  private finishRequest(request: MetadataRequest): void {
    if (!request.isCurrent()) return;
    request.loading = false;
    this.updateMetadataStatus();
  }

  private updateMetadataStatus(): void {
    this.metadataLoadWarning = [...this.metadataRequests.values()].some(request => request.failed);
    this.metadataLoading = [...this.metadataRequests.values()].some(request => request.loading);
  }

  public async retryMetadata(): Promise<void> {
    if (this.destroyed) return;
    await Promise.all([...this.metadataRequests.values()].filter(request => request.failed).map(request =>
      this.fetchMetadata(request.oid, this.beginRequest(request.expression))
    ));
  }

  protected override async initEventHandlers() {
    if (!this.formFieldCompMapEntry) {
      throw new Error(`${this.logName}: formFieldCompMapEntry is required.`);
    }
    const formComponent = this.formComponent;
    if (!formComponent) {
      throw new Error(`${this.logName}: form component is required.`);
    }

    this.expressionConsumer ??= runInInjectionContext(
      this.injector,
      () =>
        new RecordMetadataRetrieverExpressionConsumer(
          this.eventBus,
          async (event, expression, request) => this.handleExpression(event, expression, request),
          (event, expression) => this.createCandidate(event, expression),
          request => this.finishRequest(request)
        )
    );

    this.expressionConsumer.bind({
      component: this,
      definition: this.formFieldCompMapEntry,
      formComponent,
    });
    this.scheduleFormReadyExpressions();
  }

  public ngOnDestroy(): void {
    this.destroyed = true;
    this.metadataRequests.clear();
    this.metadataLoading = false;
    this.expressionConsumer?.destroy();
    this.formReadyExpressionSubscription?.unsubscribe();
  }

  public getEventFieldId(): string {
    return this.formFieldCompMapEntry?.lineagePaths?.angularComponentsJsonPointer || this.formFieldConfigName();
  }

  public async fetchMetadata(oid: string, request?: MetadataRequest): Promise<void> {
    if (this.destroyed) return;
    request ??= this.beginRequest();
    if (!request.isCurrent()) return;
    const trimmedOid = oid.trim();
    if (request.oid !== trimmedOid) request.failed = false;
    request.oid = trimmedOid;
    if (!trimmedOid || trimmedOid === request.lastFetchedOid) {
      request.failed = false;
      this.finishRequest(request);
      return;
    }
    request.loading = true;
    this.updateMetadataStatus();
    try {
      const metadata = await this.recordService.getRecordMeta(trimmedOid);
      if (!request.isCurrent()) return;
      request.failed = false;
      request.lastFetchedOid = trimmedOid;
      const payload =
        typeof metadata === 'object' && metadata !== null
          ? { ...(metadata as Record<string, unknown>), oid: trimmedOid }
          : { oid: trimmedOid, value: metadata };

      this.eventBus.publish(
        createFieldValueChangedEvent({
          fieldId: this.getEventFieldId(),
          sourceId: this.getEventFieldId(),
          value: payload,
        })
      );
    } catch (error) {
      if (!request.isCurrent()) return;
      this.loggerService.error(`${this.logName}: Failed to fetch metadata for oid '${trimmedOid}'.`, error);
      request.failed = true;
    } finally {
      this.finishRequest(request);
    }
  }

  private shouldHandleExpression(event: FormComponentEvent, expression: FormExpressionsConfigFrame): boolean {
    if (expression.config.operation !== 'fetchMetadata') {
      this.loggerService.warn(`${this.logName}: Unsupported operation '${expression.config.operation ?? ''}'.`, expression);
      return false;
    }
    const isFormReadyEvent = event.sourceId === FormComponentEventType.FORM_DEFINITION_READY;
    if (expression.config.runOnFormReady === true && !isFormReadyEvent) {
      return false;
    }
    if (expression.config.runOnFormReady === false && isFormReadyEvent) {
      return false;
    }
    if (expression.config.runOnFormReady === true && event.fieldId !== this.getEventFieldId()) {
      return false;
    }
    const conditionKind = expression.config.conditionKind ?? ExpressionsConditionKind.JSONPointer;
    if ((conditionKind === ExpressionsConditionKind.JSONata || conditionKind === ExpressionsConditionKind.JSONataQuery)
      && event.sourceId !== '*' && !isFormReadyEvent) {
      return false;
    }
    if (conditionKind === ExpressionsConditionKind.JSONPointer) {
      const {jsonPointer: targetFieldId} = getEventJSONPointerCondition(expression.config.condition ?? '');
      if (targetFieldId && event.fieldId !== targetFieldId && event.sourceId !== targetFieldId) {
        return false;
      }
    }

    return true;
  }

  private async handleExpression(event: FormComponentEvent, expression: FormExpressionsConfigFrame, request?: MetadataRequest): Promise<void> {
    if (this.destroyed || !this.shouldHandleExpression(event, expression)) return;
    request ??= this.beginRequest(expression);
    if (!request.isCurrent()) return;
    const isFormReadyEvent = event.sourceId === FormComponentEventType.FORM_DEFINITION_READY;
    let oidValue: unknown = (event as { value?: unknown }).value;
    if (expression.config.hasTemplate) {
      const expressionConsumer = this.expressionConsumer;
      if (!expressionConsumer) {
        this.loggerService.warn(`${this.logName}: Expression consumer is not initialised.`, expression);
        return;
      }
      oidValue = await expressionConsumer.evaluateTemplateExpression(expression, event);
      if (!request.isCurrent()) return;
      if ((oidValue === undefined || oidValue === null || oidValue === '') && isFormReadyEvent) {
        oidValue = this.resolveRequestParamTemplate(expression.config.template);
      }
    }

    if (!request.isCurrent()) return;
    if (oidValue === undefined || oidValue === null) {
      await this.fetchMetadata('', request);
      return;
    }

    const oidString = typeof oidValue === 'string' ? oidValue : String(oidValue);
    await this.fetchMetadata(oidString, request);
  }

  private async runFormReadyExpressions(): Promise<void> {
    const expressions = this.formFieldCompMapEntry?.expressions ?? [];
    const syntheticEvent: FieldValueChangedEvent = {
      type: FormComponentEventType.FIELD_VALUE_CHANGED,
      fieldId: this.getEventFieldId(),
      sourceId: FormComponentEventType.FORM_DEFINITION_READY,
      value: undefined,
      timestamp: Date.now(),
    };

    if (this.destroyed) return;
    await Promise.all(expressions.filter(expression => expression.config.runOnFormReady === true).map(async expression => {
      const request = this.beginRequest(expression);
      try {
        await this.handleExpression(syntheticEvent, expression, request);
      } finally {
        this.finishRequest(request);
      }
    }));
  }

  private scheduleFormReadyExpressions(): void {
    if (this.formReadyExpressionSubscription && !this.formReadyExpressionSubscription.closed) {
      return;
    }

    this.formReadyExpressionSubscription = this.eventBus
      .select$(FormComponentEventType.FORM_DEFINITION_READY)
      .pipe(take(1))
      .subscribe({
        next: () => {
          void this.runFormReadyExpressions().catch(error => this.loggerService.error(`${this.logName}: Failed to evaluate form-ready metadata expressions.`, error));
        },
      });
  }

  private resolveRequestParamTemplate(template?: string): unknown {
    if (!template) {
      return undefined;
    }
    const match = template.match(/^(?:runtimeContext\.)?requestParams\.([A-Za-z0-9_:-]+)$/);
    if (!match) {
      return undefined;
    }
    const formComponent = this.formComponent;
    return formComponent?.requestParams?.()?.[match[1]];
  }
}
