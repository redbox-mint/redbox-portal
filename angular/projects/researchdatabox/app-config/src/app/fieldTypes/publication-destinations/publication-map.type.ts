import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { FieldType, FieldTypeConfig, FormlyFieldConfig } from '@ngx-formly/core';
import { FormlyJsonschema } from '@ngx-formly/core/json-schema';
import { JSONSchema7 } from 'json-schema';
import { configurePublicationFields } from './publication-fields';

/** Schema-defined named provider settings, including wildcard credential paths. */
@Component({
  selector: 'formly-publication-map',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="mb-3">
      <legend class="h6">{{ props.label }}</legend>
      @for (entry of field.fieldGroup; track entry.key) {
        <formly-field [field]="entry"></formly-field>
      }
      <label [for]="id + '-key'">{{ '@publication-config-setting-name' | i18next }}</label>
      <input [id]="id + '-key'" class="form-control" [(ngModel)]="newKey" [ngModelOptions]="{ standalone: true }" />
      @if (invalidKey) {
        <p class="text-danger" role="alert">{{ '@publication-config-setting-invalid' | i18next }}</p>
      }
      <button type="button" class="btn btn-default mt-2" (click)="addEntry()">
        {{ '@publication-config-setting-add' | i18next }}
      </button>
    </fieldset>
  `,
})
export class PublicationMapTypeComponent extends FieldType<FieldTypeConfig> implements OnInit {
  private readonly translation = inject(TranslationService);
  private readonly jsonSchema = inject(FormlyJsonschema);
  newKey = '';
  invalidKey = false;
  ngOnInit(): void {
    this.buildEntries();
  }
  addEntry(): void {
    const model: Record<string, unknown> = this.model ?? {};
    if (!this.model) {
      const key = Array.isArray(this.field.key) ? this.field.key[0] : this.field.key;
      const parent = this.field.parent?.model as Record<string, unknown> | undefined;
      if (parent && key !== undefined) parent[String(key)] = model;
    }
    if (
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(this.newKey) ||
      ['constructor', 'prototype'].includes(this.newKey) ||
      Object.hasOwn(model, this.newKey)
    ) {
      this.invalidKey = true;
      return;
    }
    model[this.newKey] = {};
    this.buildEntries();
    this.formControl.markAsDirty();
    this.newKey = '';
    this.invalidKey = false;
  }
  private buildEntries(): void {
    this.field.fieldGroup = Object.keys(this.model ?? {}).map(key => {
      const schema: JSONSchema7 = this.props['entrySchema'];
      const field = configurePublicationFields(this.jsonSchema.toFieldConfig(schema));
      const localise = (child: FormlyFieldConfig): void => {
        if (child.props?.description?.startsWith('@'))
          child.props.description = this.translation.t(child.props.description);
        child.fieldGroup?.forEach(localise);
        if (child.fieldArray && typeof child.fieldArray !== 'function') localise(child.fieldArray);
      };
      localise(field);
      field.key = [key];
      field.props = { ...field.props, label: key };
      return field;
    });
    this.options.build?.(this.field);
  }
}
