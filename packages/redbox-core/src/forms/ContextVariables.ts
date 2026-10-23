import { get as _get, escape as _escape } from 'lodash';
import { RecordContextVariableConfig } from '../config/record.config';

export type ContextVariablesConfigMap = Record<string, RecordContextVariableConfig>;

export interface ContextVariableRequest {
  readonly user?: unknown;
  readonly session?: unknown;
  readonly headers?: unknown;
  param(name: string): unknown;
  get?(name: string): unknown;
}
export class ContextVariables {
  public constructor(
    private readonly config: ContextVariablesConfigMap,
    private readonly log: Pick<import('@researchdatabox/sails-ng-common').ILogger, 'warn'>
  ) {}
  public evaluateContextVariables(req: ContextVariableRequest, recordData: unknown): Record<string, string> {
    const result: Record<string, string> = {};
    const contextVariablesConfig = this.config;
    for (const [fieldKey, fieldConfig] of Object.entries(contextVariablesConfig)) {
      if (!fieldConfig) {
        continue;
      }

      try {
        const rawValue = this.resolveValue(req, recordData, fieldKey, fieldConfig);
        result[fieldKey] = this.sanitizeContextVariableValue(rawValue);
      } catch (error) {
        const errorType = error instanceof Error ? error.name : 'UnknownError';
        this.log.warn(`Failed to evaluate context variable: ${fieldKey}. Error: ${errorType}`);
        result[fieldKey] = '';
      }
    }
    return result;
  }

  private resolveValue(
    req: ContextVariableRequest,
    recordData: unknown,
    fieldKey: string,
    config: RecordContextVariableConfig
  ): unknown {
    if (config.source === 'request') {
      return this.resolveFromRequest(req, config);
    }
    if (config.source === 'metadata') {
      return this.resolveFromRecord(recordData, config, 'metadata');
    }
    if (config.source === 'record') {
      return this.resolveFromRecord(recordData, config);
    }
    this.log.warn(
      `Unsupported context variable source for ${fieldKey}: ${String((config as { source?: unknown }).source ?? '')}`
    );
    return '';
  }

  private resolveFromRecord(recordData: unknown, config: RecordContextVariableConfig, basePath?: string): unknown {
    const field = String(config.field ?? '').trim();
    if (!field) {
      return '';
    }
    const path = basePath ? `${basePath}.${field}` : field;
    return _get(recordData, path);
  }

  private resolveFromRequest(req: ContextVariableRequest, config: RecordContextVariableConfig): unknown {
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

  private resolveHeader(req: ContextVariableRequest, field: string): unknown {
    const normalizedName = field.toLowerCase();
    if (typeof req.get === 'function') {
      const fromGet = req.get(normalizedName);
      if (fromGet !== undefined) {
        return fromGet;
      }
    }
    return _get(req, `headers.${normalizedName}`);
  }

  private resolveParsedUrlValue(value: unknown, searchParam?: string): string {
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

  private sanitizeContextVariableValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return _escape(JSON.stringify(value));
    }
    return _escape(String(value));
  }
}
