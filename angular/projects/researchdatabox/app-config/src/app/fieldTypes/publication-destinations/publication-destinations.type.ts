import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FieldType, FieldTypeConfig, FormlyFieldConfig } from '@ngx-formly/core';
import { FormlyJsonschema } from '@ngx-formly/core/json-schema';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { JSONSchema7 } from 'json-schema';
import { configurePublicationFields, publicationEditorSchema, PublicationProviderEditor } from './publication-fields';

@Component({
  selector: 'formly-publication-destinations',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="mb-4">
      <legend>{{ '@publication-config-destinations' | i18next }}</legend>
      <p>{{ '@publication-config-identity-help' | i18next }}</p>
      @for (entry of field.fieldGroup; track entry.key) {
        <fieldset class="border rounded p-3 mb-3" [attr.data-destination-id]="entry.key">
          <legend class="h5 w-auto">{{ entry.key }}</legend>
          @if (!providerFor(entry)) {
            <p class="alert alert-danger" role="alert">{{ '@publication-config-provider-unknown' | i18next }}</p>
          } @else if (!canProcess(entry)) {
            <p class="alert alert-warning" role="status">{{ '@publication-config-provider-unavailable' | i18next }}</p>
          }
          <formly-field [field]="entry"></formly-field>
        </fieldset>
      } @empty {
        <p class="text-muted">{{ '@publication-config-empty' | i18next }}</p>
      }
      <div class="border rounded p-3">
        <label [for]="id + '-new-id'">{{ '@publication-config-destination-id' | i18next }}</label>
        <input
          [id]="id + '-new-id'"
          class="form-control mb-2"
          [ngModel]="newId"
          (ngModelChange)="newId = $event; addError = ''"
          [ngModelOptions]="{ standalone: true }"
        />
        <label [for]="id + '-new-provider'">{{ '@publication-config-provider' | i18next }}</label>
        <select
          [id]="id + '-new-provider'"
          class="form-select mb-2"
          [(ngModel)]="newProvider"
          [ngModelOptions]="{ standalone: true }"
        >
          @for (provider of providers; track provider.id) {
            <option [value]="provider.id">{{ provider.id }}</option>
          }
        </select>
        @if (addError) {
          <p class="text-danger" role="alert">{{ addError | i18next }}</p>
        }
        <button type="button" class="btn btn-default" (click)="addDestination()">
          {{ '@publication-config-add' | i18next }}
        </button>
      </div>
    </fieldset>
  `,
})
export class PublicationDestinationsTypeComponent extends FieldType<FieldTypeConfig> implements OnInit {
  private readonly translation = inject(TranslationService);
  private readonly jsonSchema = inject(FormlyJsonschema);
  providers: PublicationProviderEditor[] = [];
  newId = '';
  newProvider = '';
  addError = '';

  ngOnInit(): void {
    this.providers = this.props['providers'] ?? [];
    this.newProvider = this.providers[0]?.id ?? '';
    const destinations = this.model as Record<string, Record<string, unknown>>;
    this.field.fieldGroup = Object.entries(destinations ?? {}).map(([id, value]) => this.destinationField(id, value));
    this.options.build?.(this.field);
  }

  providerFor(field: FormlyFieldConfig): PublicationProviderEditor | undefined {
    return this.providers.find(provider => provider.id === field.props?.['providerId']);
  }
  canProcess(field: FormlyFieldConfig): boolean {
    const provider = this.providerFor(field);
    return !!provider?.executionAvailable && provider.capabilities.synchronise && provider.capabilities.reconcile;
  }
  addDestination(): void {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(this.newId)) {
      this.addError = '@publication-config-id-invalid';
      return;
    }
    const destinations = this.model as Record<string, Record<string, unknown>>;
    if (Object.hasOwn(destinations, this.newId)) {
      this.addError = '@publication-config-id-duplicate';
      return;
    }
    if (!this.providers.some(provider => provider.id === this.newProvider)) {
      this.addError = '@publication-config-provider-unknown';
      return;
    }
    const value = {
      provider: this.newProvider,
      displayName: this.newId,
      enabled: false,
      archived: false,
      connection: {},
      mapping: {},
      attachments: {},
      writeBack: {},
      providerOptions: {},
    };
    destinations[this.newId] = value;
    this.field.fieldGroup = [...(this.field.fieldGroup ?? []), this.destinationField(this.newId, value)];
    this.options.build?.(this.field);
    this.formControl.markAsDirty();
    this.newId = '';
    this.addError = '';
  }
  private destinationField(id: string, value: Record<string, unknown>): FormlyFieldConfig {
    const provider = this.providers.find(item => item.id === value['provider']);
    const canProcess =
      !!provider?.executionAvailable && provider.capabilities.synchronise && provider.capabilities.reconcile;
    const properties: JSONSchema7['properties'] = {
      provider: { type: 'string', readOnly: true },
      displayName: { type: 'string', minLength: 1 },
      enabled: { type: 'boolean', default: false, readOnly: !canProcess },
      archived: { type: 'boolean', default: false },
      ...provider?.schema.properties,
      writeBack: { type: 'object' },
    };
    const schema = publicationEditorSchema(
      { type: 'object', required: ['displayName'], properties },
      provider?.secretPaths
    );
    const field = configurePublicationFields(this.jsonSchema.toFieldConfig(schema));
    const annotate = (child: FormlyFieldConfig): void => {
      if (child.props?.description?.startsWith('@'))
        child.props.description = this.translation.t(child.props.description);
      child.fieldGroup?.forEach(annotate);
      if (child.fieldArray && typeof child.fieldArray !== 'function') annotate(child.fieldArray);
      if (child.key === 'attachments' && provider && !provider.capabilities.synchronise) {
        child.hide = true;
        child.resetOnHide = false;
      }
    };
    annotate(field);
    field.key = [id]; // IDs may contain hyphens; always use an explicit path segment.
    field.props = { ...field.props, providerId: value['provider'] };
    return field;
  }
}
