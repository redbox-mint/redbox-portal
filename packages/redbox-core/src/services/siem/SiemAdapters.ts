import axios from 'axios';
import { STATUS_CODES } from 'node:http';
import { Effect } from 'effect';
import type { SiemDestinationConfig } from '../../configmodels/SiemConfiguration';
import type { SecurityEventAttributes } from '../../waterline-models/SecurityEvent';
import type { SiemDeliveryResult, SiemPayload } from './SiemTypes';

export class SiemAdapterError extends Error {}
export class SiemHttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseSummary?: Record<string, unknown>
  ) {
    super(message);
  }
}

function eventTime(event: SecurityEventAttributes): number {
  const parsed = Date.parse(event.occurredAt);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function syslogSeverity(eventSeverity: string): number {
  switch (eventSeverity) {
    case 'critical':
      return 2;
    case 'error':
      return 3;
    case 'warning':
      return 4;
    default:
      return 6;
  }
}

function cefSeverity(eventSeverity: string): number {
  switch (eventSeverity) {
    case 'critical':
      return 10;
    case 'error':
      return 8;
    case 'warning':
      return 5;
    default:
      return 3;
  }
}

function flattenEvent(event: SecurityEventAttributes): Record<string, unknown> {
  return {
    eventId: event.eventId,
    brandId: event.brandId,
    portalId: event.portalId,
    eventType: event.eventType,
    category: event.category,
    severity: event.severity,
    occurredAt: event.occurredAt,
    source: event.source,
    actor: event.actor,
    subject: event.subject,
    resource: event.resource,
    requestContext: event.requestContext,
    payload: event.payload,
    correlationId: event.correlationId,
    traceId: event.traceId,
  };
}

function escapeCefHeaderField(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function escapeLeefHeaderField(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function escapeCefExtension(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/=/g, '\\=')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}
function otlpValue(value: unknown): object {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'number' && Number.isFinite(value))
    return Number.isSafeInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(otlpValue) } };
  if (typeof value === 'object' && value !== null)
    return {
      kvlistValue: {
        values: Object.entries(value)
          .filter(([, item]) => item != null)
          .map(([key, item]) => ({ key, value: otlpValue(item) })),
      },
    };
  return {};
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function responseDetails(status: number, data: unknown): Record<string, unknown> {
  // Collector bodies can echo credentials or event data. Persist only allowlisted numeric diagnostics.
  const partial = isRecord(data) && isRecord(data.partialSuccess) ? data.partialSuccess : {};
  return {
    statusText: STATUS_CODES[status] ?? 'HTTP response',
    ...(isRecord(data) && typeof data.code === 'number' ? { collectorCode: data.code } : {}),
    ...(partial.rejectedLogRecords != null
      ? {
          rejectedLogRecords: String(partial.rejectedLogRecords)
            .replace(/[^0-9]/g, '')
            .slice(0, 20),
        }
      : {}),
  };
}

function buildBody(events: SecurityEventAttributes[], destination: SiemDestinationConfig): unknown {
  switch (destination.adapterType) {
    case 'splunk-hec-json':
      return events
        .map(event =>
          JSON.stringify({
            time: Math.floor(eventTime(event) / 1000),
            source: event.source,
            sourcetype: 'redbox:security',
            event: flattenEvent(event),
          })
        )
        .join('\n');
    case 'otel-otlp-logs':
      return {
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: events.map(event => ({
                  timeUnixNano: String(BigInt(eventTime(event)) * 1000000n),
                  severityText: event.severity,
                  body: otlpValue(flattenEvent(event)),
                })),
              },
            ],
          },
        ],
      };
    case 'syslog-rfc5424-json':
      return events
        .map(
          event =>
            `<${1 * 8 + syslogSeverity(event.severity)}>1 ${event.occurredAt} redbox redbox-portal - redbox.security - ${JSON.stringify(flattenEvent(event))}`
        )
        .join('\n');
    case 'cef':
      return events
        .map(
          event =>
            `CEF:0|ReDBox|Portal|1|${escapeCefHeaderField(event.eventType)}|${escapeCefHeaderField(event.category)}|${cefSeverity(event.severity)}|eventId=${escapeCefExtension(event.eventId)} msg=${escapeCefExtension(JSON.stringify(flattenEvent(event)))}`
        )
        .join('\n');
    case 'leef':
      return events
        .map(
          event =>
            `LEEF:2.0|ReDBox|Portal|1|${encodeURIComponent(event.eventType)}|0x09|eventId=${escapeLeefHeaderField(event.eventId)}\tseverity=${escapeLeefHeaderField(event.severity)}\tmsg=${escapeLeefHeaderField(JSON.stringify(flattenEvent(event)))}`
        )
        .join('\n');
    default:
      throw new SiemAdapterError(`Unsupported SIEM adapter '${String(destination.adapterType)}'`);
  }
}

function buildHeaders(destination: SiemDestinationConfig, body: unknown): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type':
      destination.adapterType === 'splunk-hec-json' || typeof body !== 'string' ? 'application/json' : 'text/plain',
    ...(destination.headers ?? {}),
  };
  if (destination.token && !Object.keys(headers).some(key => key.toLowerCase() === 'authorization')) {
    headers.Authorization =
      destination.adapterType === 'splunk-hec-json' ? `Splunk ${destination.token}` : `Bearer ${destination.token}`;
  }
  return headers;
}

export function buildSiemPayload(
  events: SecurityEventAttributes[],
  destination: SiemDestinationConfig
): Effect.Effect<SiemPayload, SiemAdapterError> {
  return Effect.try({
    try: () => {
      const body = buildBody(events, destination);
      return { body, headers: buildHeaders(destination, body) };
    },
    catch: error => (error instanceof SiemAdapterError ? error : new SiemAdapterError(String(error))),
  });
}

export function deliverSiemPayload(
  payload: SiemPayload,
  destination: SiemDestinationConfig
): Effect.Effect<SiemDeliveryResult, SiemHttpError> {
  return Effect.tryPromise({
    try: async signal => {
      const response = await axios.post(destination.endpointUrl, payload.body, {
        headers: payload.headers,
        // HEC batches are stacked JSON objects; Axios must not quote the serialized body.
        ...(typeof payload.body === 'string' ? { transformRequest: [(body: string) => body] } : {}),
        // Axios socket inactivity timeout alone does not bound a trickling response.
        signal: AbortSignal.any([signal, AbortSignal.timeout(destination.timeoutMs ?? 10000)]),
        maxRedirects: 0,
        maxContentLength: 65536,
        timeout: destination.timeoutMs ?? 10_000,
        auth:
          destination.username && destination.password
            ? { username: destination.username, password: destination.password }
            : undefined,
        validateStatus: status => status >= 200 && status < 300,
      });
      const details = responseDetails(response.status, response.data);
      if (
        destination.adapterType === 'otel-otlp-logs' &&
        isRecord(response.data) &&
        isRecord(response.data.partialSuccess) &&
        Number(response.data.partialSuccess.rejectedLogRecords ?? 0) > 0
      ) {
        throw new SiemHttpError('OTLP collector reported partial success', response.status, details);
      }
      if (
        destination.adapterType === 'splunk-hec-json' &&
        isRecord(response.data) &&
        typeof response.data.code === 'number' &&
        response.data.code !== 0
      ) {
        throw new SiemHttpError('Splunk collector rejected event', response.status, details);
      }
      return {
        status: 'success' as const,
        httpStatusCode: response.status,
        responseSummary: details,
      };
    },
    catch: error => {
      if (error instanceof SiemHttpError) return error;
      if (axios.isAxiosError(error)) {
        return new SiemHttpError(
          error.response
            ? `HTTP ${error.response.status} delivery failed`
            : error.code === 'ECONNABORTED' || error.code === 'ERR_CANCELED'
              ? 'SIEM request timed out'
              : 'SIEM transport failed',
          error.response?.status,
          error.response
            ? responseDetails(error.response.status, error.response.data)
            : { code: error.code?.replace(/[^A-Z0-9_]/g, '').slice(0, 40) }
        );
      }
      return new SiemHttpError('SIEM transport failed');
    },
  });
}
