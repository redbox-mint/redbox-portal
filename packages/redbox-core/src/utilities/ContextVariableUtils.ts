import { get as _get, escape as _escape } from 'lodash';
import { RecordContextVariableConfig } from '../config/record.config';

type ContextVariablesConfigMap = Record<string, RecordContextVariableConfig>;

export class ContextVariableUtils {
  public static evaluateContextVariables(req: Sails.Req, recordData: unknown): Record<string, string> {
    const result: Record<string, string> = {};
    const contextVariablesConfig = _get(sails, 'config.record.contextVariables', {}) as ContextVariablesConfigMap;
    for (const [fieldKey, fieldConfig] of Object.entries(contextVariablesConfig)) {
      if (!fieldConfig) {
        continue;
      }

      try {
        const rawValue = this.resolveValue(req, recordData, fieldConfig);
        result[fieldKey] = this.sanitizeContextVariableValue(rawValue);
      } catch (error) {
        const errorType = error instanceof Error ? error.name : 'UnknownError';
        sails.log.warn(`Failed to evaluate context variable: ${fieldKey}. Error: ${errorType}`);
        result[fieldKey] = '';
      }
    }
    return result;
  }

  private static resolveValue(req: Sails.Req, recordData: unknown, config: RecordContextVariableConfig): unknown {
    if (config.source === 'request') {
      return this.resolveFromRequest(req, config);
    }
    if (config.source === 'metadata') {
      return this.resolveFromRecord(recordData, config, 'metadata');
    }
    if (config.source === 'record') {
      return this.resolveFromRecord(recordData, config);
    }
    return '';
  }

  private static resolveFromRecord(recordData: unknown, config: RecordContextVariableConfig, basePath?: string): unknown {
    const field = String(config.field ?? '').trim();
    if (!field) {
      return '';
    }
    const path = basePath ? `${basePath}.${field}` : field;
    return _get(recordData, path);
  }

  private static resolveFromRequest(req: Sails.Req, config: RecordContextVariableConfig): unknown {
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

  private static sanitizeContextVariableValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return _escape(JSON.stringify(value));
    }
    return _escape(String(value));
  }
}
