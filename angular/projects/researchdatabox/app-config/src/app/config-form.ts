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
export const SECRET_RETAIN_PREFIX = '__REDACTED_FROM__:';

export function visitSecrets(model: any, paths: string[], visit: (parent: any, key: string, path: string[]) => void): void {
  const walk = (value: any, parts: string[], path: string[] = []): void => {
    if (!value || typeof value !== 'object') return;
    const [part, ...rest] = parts;
    for (const key of part === '*' ? Object.keys(value) : [part]) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (rest.length) walk(value[key], rest, [...path, key]);
      else visit(value, key, [...path, key]);
    }
  };
  paths.forEach(path => walk(model, path.split('.')));
}

export function hasEditableFields(field: FormlyFieldConfig): boolean {
  if (field.hide) return false;
  if (field.type === 'object' || !field.type) return (field.fieldGroup || []).some(hasEditableFields);
  return true;
}

export interface ConfigSummaryPart { label: string; value: string; mono: boolean; }

/** Summarise visible controls, excluding secrets and flags already shown in headers. */
export function sectionSummaryParts(fields: FormlyFieldConfig[], model: any, booleanLabel: (value: boolean) => string): ConfigSummaryPart[] {
  const values: ConfigSummaryPart[] = [];
  const add = (field: FormlyFieldConfig, value: string, label = String(field.props?.label || field.key)): void => {
    // Independent value-binding objects often repeat the same "Binding type: path".
    if (!values.some(part => part.label === label && part.value === value)) {
      const mono = /(?:^|\s)rb-admin-mono(?:\s|$)/.test(field.className || '') ||
        /^[a-z][a-z\d+.-]*:\/\//i.test(value) || /^(?:metadata|metaMetadata)\./.test(value);
      values.push({ label, value, mono });
    }
  };
  const walk = (field: FormlyFieldConfig, parent: any): void => {
    if (field.hide || field.props?.['secret'] || field.props?.type === 'password' || field.type === 'app-config-secret' || field.props?.['headerEnabled'] || field.props?.['pageEnabled'] || values.length >= 3) return;
    const value = field.key == null ? parent : parent?.[String(field.key)];
    if (field.type === 'app-config-dictionary' && value && typeof value === 'object') {
      const keys = Object.keys(value);
      add(field, `${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '…' : ''}`, `${keys.length} ${field.props?.label || field.key}`);
    } else if (field.fieldGroup?.length && field.type !== 'array' && field.type !== 'app-config-chips') {
      field.fieldGroup.forEach(child => walk(child, value));
    } else if (value !== undefined && value !== null && value !== '' && typeof value !== 'object') {
      const text = typeof value === 'boolean' ? booleanLabel(value) : String(value);
      add(field, text.slice(0, 85));
    } else if (Array.isArray(value) && value.length) {
      const text = value.every(item => typeof item !== 'object') ? value.join(', ').slice(0, 85) : String(value.length);
      add(field, text);
    }
  };
  fields.forEach(field => walk(field, model));
  return values;
}

export function sectionSummary(fields: FormlyFieldConfig[], model: any, booleanLabel: (value: boolean) => string): string {
  return sectionSummaryParts(fields, model, booleanLabel).map(part => `${part.label}: ${part.value}`).join(' · ');
}

/** Only schema-declared identifying controls are safe to show in a collapsed dictionary row. */
export function dictionarySummary(field: FormlyFieldConfig, value: any, booleanLabel: (value: boolean) => string): string {
  if (!value || typeof value !== 'object' || Array.isArray(value) || field.hide || field.props?.['secret']) return '';
  const identifying = ['label', 'name', 'title', 'displayName', 'publicUrl', 'frontEndUrl', 'baseUrl', 'url', 'host', 'id', 'type'];
  const fields = field.fieldGroup || [];
  const values: string[] = [];
  for (const key of [...identifying, 'enabled']) {
    const control = fields.find(child => String(Array.isArray(child.key) ? child.key[0] : child.key) === key);
    if (!control || control.hide || control.props?.['secret'] || control.props?.type === 'password' ||
        !['string', 'number', 'integer', 'enum', 'app-config-checkbox'].includes(String(control.type))) continue;
    const scalar = value[key];
    if (scalar == null || scalar === '' || typeof scalar === 'object') continue;
    let text = typeof scalar === 'boolean' ? booleanLabel(scalar) : String(scalar).trim();
    if (!text || text.includes('__REDACTED')) continue;
    if (/url$/i.test(key)) {
      try {
        const url = new URL(text);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
        url.search = ''; url.hash = '';
        text = url.toString();
      } catch { continue; }
    }
    text = text.replace(/\s+/g, ' ');
    text = text.length > 65 ? text.slice(0, 64) + '…' : text;
    if (!values.includes(text)) values.push(text);
    if (values.length === 3) break;
  }
  const summary = values.join(' · ');
  return summary.length > 160 ? summary.slice(0, 159) + '…' : summary;
}
