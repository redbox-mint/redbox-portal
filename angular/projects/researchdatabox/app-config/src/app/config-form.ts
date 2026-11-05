import { FormlyFieldConfig } from '@ngx-formly/core';

export interface ConfigSection {
  titleKey: string;
  fields: string[];
}

/** Presentation metadata is separate from the model submitted to the existing API. */
export interface ConfigForm {
  model: any;
  schema: any;
  fieldOrder?: string[];
  title?: string;
  descriptionKey?: string;
  sections?: ConfigSection[];
  secretFields?: string[];
  requiresSetup?: boolean;
  hasOverride?: boolean;
}

export const SECRET_MASK = '__REDACTED__';

export function visitSecrets(model: any, paths: string[], visit: (parent: any, key: string) => void): void {
  const walk = (value: any, parts: string[]): void => {
    if (!value || typeof value !== 'object') return;
    const [part, ...rest] = parts;
    for (const key of part === '*' ? Object.keys(value) : [part]) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (rest.length) walk(value[key], rest);
      else visit(value, key);
    }
  };
  paths.forEach(path => walk(model, path.split('.')));
}

export function hasEditableFields(field: FormlyFieldConfig): boolean {
  if (field.hide) return false;
  if (field.type === 'object' || !field.type) return (field.fieldGroup || []).some(hasEditableFields);
  return true;
}

/** Summarise only visible scalar controls, never passwords or opaque object values. */
export function sectionSummary(fields: FormlyFieldConfig[], model: any, booleanLabel: (value: boolean) => string): string {
  const values: string[] = [];
  const walk = (field: FormlyFieldConfig, parent: any): void => {
    if (field.hide || field.props?.['secret'] || values.length >= 3) return;
    const value = field.key == null ? parent : parent?.[String(field.key)];
    if (field.fieldGroup?.length && field.type !== 'array' && field.type !== 'app-config-chips') {
      field.fieldGroup.forEach(child => walk(child, value));
    } else if (value !== undefined && value !== null && value !== '' && typeof value !== 'object') {
      const text = typeof value === 'boolean' ? booleanLabel(value) : String(value);
      values.push(`${field.props?.label || field.key}: ${text.slice(0, 85)}`);
    } else if (Array.isArray(value) && value.length) {
      const text = value.every(item => typeof item !== 'object') ? value.join(', ').slice(0, 85) : String(value.length);
      values.push(`${field.props?.label || field.key}: ${text}`);
    }
  };
  fields.forEach(field => walk(field, model));
  return values.join(' · ');
}
