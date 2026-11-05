import { RelatedDataStateService } from '../form-state/related-records/related-data-state.service';
import { Subscription, take } from 'rxjs';
import { RecordService } from '@researchdatabox/portal-ng-common';
import { RelatedMetadataEntry, RelatedSourceDescriptor } from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { createFieldValueChangedEvent, FormComponentEventType } from '../form-state/events/form-component-event.types';
import { publishControlValueNotification, ValueNotificationCause } from '../form-state/control-value-notifications';
import { RelatedRecordRequests, readRelatedReference, relatedReferenceIdentity } from '../form-state/related-records/related-record-request';
import { Component, inject } from '@angular/core';
import { ContentFieldComponentConfig, RelatedObjectDataComponentName, RelatedObjectDataFieldComponentConfig } from '@researchdatabox/sails-ng-common';
import { ContentComponent } from './content.component';

@Component({
  selector: 'redbox-related-object-data',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <span class="rb-form-content" [class.rb-form-rich-text-content]="isRichTextContent" [innerHtml]="content"></span>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false,
})
export class RelatedObjectDataComponent extends ContentComponent {
  protected override logName = RelatedObjectDataComponentName;

  private readonly relatedDataState = inject(RelatedDataStateService, { optional: true });
  private readonly recordService = inject(RecordService);
  private readonly eventBus = inject(FormComponentEventBus);
  private readonly requests = new RelatedRecordRequests();
  private readonly isActive = this.requests.guard(() => true);
  private readonly relatedSubscriptions = new Subscription();
  private releaseWork?: () => void;
  private descriptor?: RelatedSourceDescriptor;
  private fingerprint?: string;
  private result?: RelatedMetadataEntry & { loading?: boolean };

  protected override async initEventHandlers(): Promise<void> {
    await super.initEventHandlers();
    if (!this.isActive()) return;
    const relationId = (this.componentDefinition?.config as RelatedObjectDataFieldComponentConfig)?.relationId;
    if (!relationId) return;
    const pointer = this.formFieldCompMapEntry?.lineagePaths?.angularComponentsJsonPointer;
    this.descriptor = this.formComponent.formDefMap?.formConfig?.relatedRecords?.sources.find(
      (source: RelatedSourceDescriptor) => source.componentPointer === pointer && source.relationId === relationId);
    if (!this.descriptor) throw new Error('Missing related source descriptor');
    // Keep the registered source pending until form-ready permits its first publication.
    this.releaseWork = this.relatedDataState?.begin();
    this.relatedDataState?.result(this.descriptor.componentPointer, !!this.descriptor.required);
    this.relatedSubscriptions.add(this.eventBus.select$(FormComponentEventType.FORM_DEFINITION_READY).pipe(take(1)).subscribe(() => {
      this.relatedSubscriptions.add(this.formComponent.form.valueChanges.subscribe(() => {
        // Preserve attribution even for aggregate changes without a field event.
        publishControlValueNotification(this.formComponent.form, cause => { void this.refreshRelatedData(false, false, cause); });
      }));
      this.relatedSubscriptions.add(this.eventBus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe(event => {
        if (event.sourceId !== pointer) void this.refreshRelatedData(false, false, event);
      }));
      this.relatedSubscriptions.add(this.eventBus.select$(FormComponentEventType.FIELD_DEPENDENCY_TRIGGER).subscribe(event => {
        if (event.dependentFields.includes(pointer!)) void this.refreshRelatedData(true);
      }));
      void this.refreshRelatedData(false, true);
    }));
  }

  /** Explicit refresh intentionally re-reads an unchanged reference. */
  public async refreshRelatedData(force = false, initial = false, origin: ValueNotificationCause = {}): Promise<void> {
    const descriptor = this.descriptor;
    if (!descriptor || !this.isActive()) return;
    // Only snapshot the referenced subtree; unrelated fields can be large.
    const [rootToken, ...tokens] = descriptor.referenceTokens;
    const referenceControl = rootToken === undefined ? this.formComponent.form : this.formComponent.form.get([rootToken]);
    const reference = readRelatedReference(referenceControl?.getRawValue(), tokens);
    const identity = relatedReferenceIdentity(reference, descriptor.oidTokens);
    const fingerprint = JSON.stringify(identity);
    if (!force && fingerprint === this.fingerprint) return;
    this.fingerprint = fingerprint;
    this.releaseWork?.();
    const release = this.relatedDataState?.begin() ?? (() => {});
    this.releaseWork = release;
    this.relatedDataState?.result(descriptor.componentPointer, !!descriptor.required);
    try {
      const request = this.requests.candidate();
      // Snapshot the cause for this generation, across loading, fetch and rendering.
      const cause: ValueNotificationCause = {
        ...(origin.behaviourChain ? { behaviourChain: [...origin.behaviourChain] } : {}),
        expressionChain: [...(origin.expressionChain ?? []), `${RelatedObjectDataComponentName}:${descriptor.componentPointer}`],
      };
      const publish = async (result: RelatedMetadataEntry & { loading?: boolean }) => {
        if (!request.isCurrent()) return;
        this.result = result;
        if (!result.loading) this.relatedDataState?.result(descriptor.componentPointer, !!descriptor.required, result);
        this.eventBus.publish(createFieldValueChangedEvent({
          fieldId: descriptor.componentPointer, sourceId: descriptor.componentPointer, value: result, ...cause,
          isCurrent: () => request.isCurrent() && this.result === result,
        }));
        if (!request.isCurrent()) return;
        await this.refreshContent();
      };
      if (initial && descriptor.initialResult && fingerprint === descriptor.referenceFingerprint) {
        await publish(descriptor.initialResult);
        return;
      }
      if (!identity.values.length && !identity.invalidIndices.length) {
        await publish({ status: 'empty', records: [], issues: [] });
        return;
      }
      // Detach overrides only for an actual request, before rendering can await.
      const references = { [descriptor.relationId]: structuredClone(reference) ?? null };
      await publish({ status: 'empty', records: [], issues: [], loading: true });
      if (!request.isCurrent()) return;
      try {
        const oid = this.formComponent.trimmedParams.oid();
        const response = await this.recordService.resolveRelatedMetadata(oid
          ? { oid, relations: [descriptor.relationId], references }
          : { recordType: this.formComponent.trimmedParams.recordType(), relations: [descriptor.relationId], references });
        if (!request.isCurrent()) return;
        await publish(response[descriptor.relationId] ?? { status: 'failed', records: [], issues: [{ code: 'source-read-failed' }] });
      } catch {
        if (request.isCurrent()) await publish({ status: 'failed', records: [], issues: [{ code: 'source-read-failed' }] });
      }
    } finally { release(); }
  }

  override ngOnDestroy(): void {
    this.releaseWork?.();
    if (this.descriptor) this.relatedDataState?.remove(this.descriptor.componentPointer);
    this.requests.dispose();
    this.relatedSubscriptions.unsubscribe();
    super.ngOnDestroy();
  }

  protected override shouldRenderWithTemplate(config: ContentFieldComponentConfig): boolean {
    return !!config?.template;
  }

  protected override buildTemplateContext(config: RelatedObjectDataFieldComponentConfig, formData: Record<string, unknown>): Record<string, unknown> {
    // Relation-mode buckets are untrusted until the current fingerprint is accepted.
    const useLegacyBuckets = !config.relationId;
    return {
      ...super.buildTemplateContext(config, formData),
      relatedObjects: this.result ? this.result.records.map(record => ({ oid: record.redboxOid, fields: record.metadata, ...(typeof record.metadata['title'] === 'string' ? { title: record.metadata['title'] } : {}) })) : useLegacyBuckets ? config.relatedObjects ?? [] : [],
      relatedMetadata: this.result,
      accessDeniedOids: this.result || !useLegacyBuckets ? [] : config.accessDeniedOids ?? [],
      failedOids: this.result || !useLegacyBuckets ? [] : config.failedOids ?? [],
    };
  }
}
