import { get as _get, escape as _escape } from 'lodash';
import { RecordCustomFieldConfig } from '../config/record.config';

type RequestCustomFieldType = NonNullable<RecordCustomFieldConfig['type']>;
type CustomFieldsConfigMap = Record<string, RecordCustomFieldConfig>;

export class CustomFieldUtils {
  public static evaluateCustomFields(req: Sails.Req, _recordData: unknown): Record<string, string> {
    const result: Record<string, string> = {};
    const customFieldsConfig = _get(sails, 'config.record.customFields', {}) as CustomFieldsConfigMap;
    for (const [fieldKey, fieldConfig] of Object.entries(customFieldsConfig)) {
      if (!fieldConfig || fieldConfig.source !== 'request') {
        if (fieldConfig?.source && fieldConfig.source !== 'request') {
          sails.log.warn(`Unsupported custom field source for ${fieldKey}: ${fieldConfig.source}`);
        }
        continue;
      }

      try {
        const rawValue = this.resolveFromRequest(req, fieldConfig);
        result[fieldKey] = this.sanitizeCustomFieldValue(rawValue);
      } catch (error) {
        const errorType = error instanceof Error ? error.name : 'UnknownError';
        sails.log.warn(`Failed to evaluate custom field: ${fieldKey}. Error: ${errorType}`);
        result[fieldKey] = '';
      }
    }
    return result;
  }

  private static resolveFromRequest(req: Sails.Req, config: RecordCustomFieldConfig): unknown {
    const sourceType = config.type;
    const field = String(config.field ?? '').trim();
    if (!sourceType) {
      return '';
    }
    if (!field) {
      return '';
    }

    let value: unknown = '';
    if (sourceType === 'user') {
      value = _get(req, `user.${field}`);
    } else if (sourceType === 'session') {
      value = _get(req, `session.${field}`);
    } else if (sourceType === 'param') {
      value = req.param(field);
    } else if (sourceType === 'header') {
      value = this.resolveHeader(req, field);
    } else {
      return '';
    }

    if (config.parseUrl === true) {
      return this.resolveParsedUrlValue(value, config.searchParams);
    }

    return value;
  }

  private static resolveHeader(req: Sails.Req, field: string): unknown {
    const normalizedName = field.toLowerCase();
    if (typeof req.get === 'function') {
      const fromGet = req.get(normalizedName);
      if (fromGet !== undefined) {
        return fromGet;
      }
    }
    return _get(req, `headers.${normalizedName}`);
  }

  private static resolveParsedUrlValue(value: unknown, searchParam?: string): string {
    const source = String(value ?? '').trim();
    if (!source) {
      return '';
    }

    const url = new URL(source);
    const queryParam = String(searchParam ?? '').trim();
    if (!queryParam) {
      return url.toString();
    }
    return url.searchParams.get(queryParam) ?? '';
  }

  private static sanitizeCustomFieldValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return _escape(JSON.stringify(value));
    }
    return _escape(String(value));
  }
}
