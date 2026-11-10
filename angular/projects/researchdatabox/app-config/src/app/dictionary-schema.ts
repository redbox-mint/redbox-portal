import { FormlyFieldConfig } from '@ngx-formly/core';
import { FormlyJsonschema } from '@ngx-formly/core/json-schema';
import { JSONSchema7 } from 'json-schema';

/** Retain literal map keys and delegate every value to the normal schema converter. */
export function configSchemaToField(converter: FormlyJsonschema, schema: JSONSchema7, preserve = false): FormlyFieldConfig {
  return converter.toFieldConfig(schema, {
    map: (field, node) => {
      if (preserve) delete field.defaultValue;
      // JSON Schema property names are literal; Formly string keys otherwise parse dots/brackets as paths.
      if (typeof field.key === 'string' && /[.\[\]]/.test(field.key)) field.key = [field.key];
      if (preserve && field.type === 'string') field.parsers = [];
      const patterns = Object.entries(node.patternProperties || {});
      if (node.type === 'object' && (patterns.length || typeof node.additionalProperties === 'object')) {
        field.type = 'app-config-dictionary';
        field.fieldGroup = [];
        field.wrappers = [];
        field.props = { ...field.props, dictionarySchema: node,
          dictionaryField: (key: string) => {
            const matches = patterns.filter(([pattern]) => new RegExp(pattern).test(key)).map(([, value]) => value);
            const fixed = Object.prototype.hasOwnProperty.call(node.properties || {}, key) ? node.properties![key] : undefined;
            const valueSchema = fixed ?? (matches.length > 1 ? { allOf: matches } : matches[0]) ?? node.additionalProperties ?? {};
            const child = configSchemaToField(converter, typeof valueSchema === 'boolean' ? {} : valueSchema, true);
            child.key = [key];
            return child;
          }
        };
      } else if (!node.type && !node.enum && !node.oneOf && !node.anyOf && !node.allOf && !node.$ref) {
        field.type = 'app-config-json';
        field.wrappers = [];
      }
      return field;
    }
  });
}
