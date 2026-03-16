import { Component, inject, Injector, Input, OnDestroy, runInInjectionContext } from '@angular/core';
import { Subscription, take } from 'rxjs';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import {
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

class RecordMetadataRetrieverExpressionConsumer extends FormComponentEventBaseConsumer {
  protected override readonly consumedEventType = FormComponentEventType.FIELD_VALUE_CHANGED;

  constructor(
    eventBus: FormComponentEventBus,
    private readonly handler: (event: FormComponentEvent, expression: FormExpressionsConfigFrame) => Promise<void>
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
    await this.handler(event, expression);
  }

  public async evaluateTemplateExpression(
    expression: FormExpressionsConfigFrame,
    event: FormComponentEvent
  ): Promise<unknown> {
    return this.evaluateExpressionJSONata(expression, event, 'template');
  }

  private handleConsumeError(err: unknown): void {
    console.error('RecordMetadataRetrieverExpressionConsumer: Error consuming matched expressions.', err);
  }

  private async consumeMatchedExpressions(event: FormComponentEvent): Promise<void> {
    const expressions = this.expressions ?? [];
    const matchedExpressions = await this.getMatchedExpressions(event, expressions);
    for (const expression of matchedExpressions ?? []) {
      await this.consumeEvent(event, expression);
    }
  }
}

@Component({
  selector: 'redbox-record-metadata-retriever',
  template: '',
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
  private lastFetchedOid?: string;

  protected override async initEventHandlers() {
    if (!this.formFieldCompMapEntry) {
      throw new Error(`${this.logName}: formFieldCompMapEntry is required.`);
    }
    const formComponent = this.getFormComponentFromAppRef()?.instance as FormComponent | undefined;
    if (!formComponent) {
      throw new Error(`${this.logName}: form component is required.`);
    }

    this.expressionConsumer ??= runInInjectionContext(
      this.injector,
      () =>
        new RecordMetadataRetrieverExpressionConsumer(
          this.eventBus,
          async (event, expression) => this.handleExpression(event, expression)
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
    this.expressionConsumer?.destroy();
    this.formReadyExpressionSubscription?.unsubscribe();
  }

  public getEventFieldId(): string {
    return this.formFieldCompMapEntry?.lineagePaths?.angularComponentsJsonPointer || this.formFieldConfigName();
  }

  public async fetchMetadata(oid: string): Promise<void> {
    const trimmedOid = oid.trim();
    if (!trimmedOid || trimmedOid === this.lastFetchedOid) {
      return;
    }

    try {
      const metadata = await this.recordService.getRecordMeta(trimmedOid);
      this.lastFetchedOid = trimmedOid;
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
      this.loggerService.error(`${this.logName}: Failed to fetch metadata for oid '${trimmedOid}'.`, error);
    }
  }

  private async handleExpression(event: FormComponentEvent, expression: FormExpressionsConfigFrame): Promise<void> {
    if (expression.config.operation !== 'fetchMetadata') {
      this.loggerService.warn(`${this.logName}: Unsupported operation '${expression.config.operation ?? ''}'.`, expression);
      return;
    }
    const isFormReadyEvent = event.sourceId === FormComponentEventType.FORM_DEFINITION_READY;
    if (expression.config.runOnFormReady === true && !isFormReadyEvent) {
      return;
    }
    if (expression.config.runOnFormReady === false && isFormReadyEvent) {
      return;
    }
    if (expression.config.runOnFormReady === true && event.fieldId !== this.getEventFieldId()) {
      return;
    }
    if (expression.config.conditionKind === 'jsonpointer') {
      const targetFieldId = expression.config.condition?.split('::')[0];
      if (targetFieldId && event.fieldId !== targetFieldId && event.sourceId !== targetFieldId) {
        return;
      }
    }

    let oidValue: unknown = (event as { value?: unknown }).value;
    if (expression.config.hasTemplate) {
      const expressionConsumer = this.expressionConsumer;
      if (!expressionConsumer) {
        this.loggerService.warn(`${this.logName}: Expression consumer is not initialised.`, expression);
        return;
      }
      oidValue = await expressionConsumer.evaluateTemplateExpression(expression, event);
      if ((oidValue === undefined || oidValue === null || oidValue === '') && isFormReadyEvent) {
        oidValue = this.resolveRequestParamTemplate(expression.config.template);
      }
    }

    if (oidValue === undefined || oidValue === null) {
      return;
    }

    const oidString = typeof oidValue === 'string' ? oidValue : String(oidValue);
    await this.fetchMetadata(oidString);
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

    for (const expression of expressions) {
      if (expression.config.runOnFormReady === true) {
        await this.handleExpression(syntheticEvent, expression);
      }
    }
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
          void this.runFormReadyExpressions();
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
    const formComponent = this.getFormComponentFromAppRef()?.instance as FormComponent | undefined;
    return formComponent?.requestParams?.()?.[match[1]];
  }
}
