import { Component, Input, inject } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import {
  PublishDataLocationRefreshComponentName,
  PublishDataLocationRefreshFieldComponentConfigOutline,
} from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { createFieldValueChangedEvent } from '../form-state/events/form-component-event.types';

@Component({
  selector: 'redbox-publish-data-location-refresh',
  templateUrl: './publish-data-location-refresh.component.html',
  standalone: false,
})
/**
 * Stateless refresh trigger for publication data locations.
 *
 * The legacy v4 control performed the fetch itself. In v5 this component only
 * emits a synthetic field change event so form behaviours can own both the
 * initial-load and explicit-refresh fetch paths.
 */
export class PublishDataLocationRefreshComponent extends FormFieldBaseComponent<never> {
  protected override logName = PublishDataLocationRefreshComponentName;

  @Input() public override model?: never;

  public buttonText = 'Refresh Attachments';
  private readonly eventBus = inject(FormComponentEventBus);

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    const config = this.componentDefinition?.config as PublishDataLocationRefreshFieldComponentConfigOutline | undefined;
    this.buttonText = String(config?.label ?? 'Refresh Attachments');
  }

  /** Resolve the concrete JSONPointer used by behaviour conditions at runtime. */
  public getEventFieldId(): string {
    return this.formFieldCompMapEntry?.lineagePaths?.angularComponentsJsonPointer || this.formFieldConfigName();
  }

  public onClick(): void {
    const fieldId = this.getEventFieldId();
    if (!fieldId || this.isDisabled || this.isReadonly) {
      return;
    }

    // The timestamp acts only as a change token; it should never become form data.
    this.eventBus.publish(
      createFieldValueChangedEvent({
        fieldId,
        sourceId: '*',
        value: Date.now(),
      })
    );
  }
}
