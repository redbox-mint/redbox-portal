import { FormlyFieldConfig } from '@ngx-formly/core';
import { JSONSchema7 } from 'json-schema';

export interface PublicationProviderEditor {
  id: string;
  schema: JSONSchema7;
  secretPaths: string[];
  capabilities: { synchronise: boolean; observe: boolean; reconcile: boolean; resourceLeases: boolean };
  executionAvailable: boolean;
}

export function configurePublicationFields(field: FormlyFieldConfig): FormlyFieldConfig {
  // JSON Schema requires the array property to exist, but permits [] unless
  // minItems says otherwise. Angular's required validator also rejects [].
  if (field.type === 'array' && !field.props?.['minItems']) {
    field.props = { ...field.props, required: false };
    field.expressions = { ...field.expressions, 'props.required': () => false };
  }
  if (field.type === 'boolean' || field.type === 'checkbox') {
    field.type = 'app-config-checkbox';
    field.wrappers = [];
  }
  if (field.type === 'value-binding-editor') field.props = { ...field.props, omitUnconfigured: true };
  // Rich widgets own their controls and must not also render their schema children.
  if (['publication-destinations', 'publication-map', 'publication-json'].includes(String(field.type))) {
    field.fieldGroup = field.type !== 'publication-json' ? [] : undefined;
    field.fieldArray = undefined;
  }
  field.fieldGroup?.forEach(configurePublicationFields);
  if (field.fieldArray && typeof field.fieldArray !== 'function') configurePublicationFields(field.fieldArray);
  return field;
}

/** Preserve provider widgets and defaults; only schema-less maps use a JSON editor. */
export function publicationEditorSchema(schema: JSONSchema7, secretPaths: string[] = []): JSONSchema7 {
  const result: JSONSchema7 = structuredClone(schema);
  for (const secret of secretPaths) {
    let node = result;
    for (const part of secret.split('.')) {
      if (part === '*') {
        if (node.type === 'array') {
          if (!node.items || Array.isArray(node.items) || typeof node.items === 'boolean')
            node.items = { type: 'object' };
          node = node.items;
          continue;
        }
        if (!node.additionalProperties || typeof node.additionalProperties === 'boolean')
          node.additionalProperties = { type: 'object' };
        node = node.additionalProperties;
      } else {
        node.properties ??= {};
        const child = node.properties[part];
        if (!child || typeof child === 'boolean') node.properties[part] = { type: 'object' };
        node = node.properties[part] as JSONSchema7;
      }
    }
    node.type = 'string';
    node.format = 'password';
    Object.assign(node, {
      widget: { formlyConfig: { props: { type: 'password', description: '@publication-config-secret-help' } } },
    });
  }
  const visit = (node: JSONSchema7, key: string): void => {
    node.title ??= key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
    const widget = (node as JSONSchema7 & { widget?: { formlyConfig?: { type?: string } } }).widget;
    if (widget?.formlyConfig?.type === 'value-binding-editor') {
      // This widget owns the binding value. Hidden schema children otherwise
      // materialise defaults (including nested sources) into absent bindings.
      delete node.properties;
      delete node.required;
      return;
    }
    if (
      !widget &&
      node.additionalProperties &&
      typeof node.additionalProperties !== 'boolean' &&
      node.additionalProperties.properties
    ) {
      visit(node.additionalProperties, '');
      Object.assign(node, {
        widget: { formlyConfig: { type: 'publication-map', props: { entrySchema: node.additionalProperties } } },
      });
      return;
    }
    if (node.type === 'object' && !Object.keys(node.properties ?? {}).length && !widget) {
      Object.assign(node, { widget: { formlyConfig: { type: 'publication-json' } } });
    }
    for (const [name, child] of Object.entries(node.properties ?? {}))
      if (typeof child !== 'boolean') visit(child, name);
    if (node.items && !Array.isArray(node.items) && typeof node.items !== 'boolean') visit(node.items, '');
  };
  visit(result, '');
  return result;
}
