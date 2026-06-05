import axios, { AxiosError } from 'axios';
import { Effect } from 'effect';
import type { SiemDestinationConfig } from '../../configmodels/SiemConfiguration';
import type { SecurityEventAttributes } from '../../waterline-models/SecurityEvent';
import type { SiemDeliveryResult, SiemPayload } from './SiemTypes';

export class SiemAdapterError extends Error {}
export class SiemHttpError extends Error {
  constructor(message: string, public readonly statusCode?: number, public readonly responseSummary?: Record<string, unknown>) {
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
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function escapeLeefHeaderField(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function buildBody(events: SecurityEventAttributes[], destination: SiemDestinationConfig): unknown {
  switch (destination.adapterType) {
    case 'splunk-hec-json':
      return events.map((event) => ({
        time: Math.floor(eventTime(event) / 1000),
        source: event.source,
        sourcetype: 'redbox:security',
        event: flattenEvent(event),
      }));
    case 'otel-otlp-logs':
      return {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: events.map((event) => ({
              timeUnixNano: String(eventTime(event) * 1_000_000),
              severityText: event.severity,
              body: { kvlistValue: { values: Object.entries(flattenEvent(event)).map(([key, value]) => ({ key, value: { stringValue: JSON.stringify(value) } })) } },
            })),
          }],
        }],
      };
    case 'syslog-rfc5424-json':
      return events.map((event) => `<${1 * 8 + syslogSeverity(event.severity)}>1 ${event.occurredAt} redbox redbox-portal - ${event.eventId} - ${JSON.stringify(flattenEvent(event))}`).join('\n');
    case 'cef':
      return events.map((event) => `CEF:0|ReDBox|Portal|1|${escapeCefHeaderField(event.eventType)}|${escapeCefHeaderField(event.category)}|${event.severity}|eventId=${event.eventId} msg=${JSON.stringify(flattenEvent(event))}`).join('\n');
    case 'leef':
      return events.map((event) => `LEEF:2.0|ReDBox|Portal|1|${escapeLeefHeaderField(event.eventType)}|\teventId=${event.eventId}\tseverity=${event.severity}\tmsg=${JSON.stringify(flattenEvent(event))}`).join('\n');
    default:
      throw new SiemAdapterError(`Unsupported SIEM adapter '${String(destination.adapterType)}'`);
  }
}

function buildHeaders(destination: SiemDestinationConfig, body: unknown): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json',
    ...(destination.headers ?? {}),
  };
  if (destination.token && !headers.Authorization) {
    headers.Authorization = destination.adapterType === 'splunk-hec-json' ? `Splunk ${destination.token}` : `Bearer ${destination.token}`;
  }
  return headers;
}

export function buildSiemPayload(events: SecurityEventAttributes[], destination: SiemDestinationConfig): Effect.Effect<SiemPayload, SiemAdapterError> {
  return Effect.try({
    try: () => {
      const body = buildBody(events, destination);
      return { body, headers: buildHeaders(destination, body) };
    },
    catch: (error) => error instanceof SiemAdapterError ? error : new SiemAdapterError(String(error)),
  });
}

export function deliverSiemPayload(payload: SiemPayload, destination: SiemDestinationConfig): Effect.Effect<SiemDeliveryResult, SiemHttpError> {
  return Effect.tryPromise({
    try: async () => {
      const response = await axios.post(destination.endpointUrl, payload.body, {
        headers: payload.headers,
        timeout: destination.timeoutMs ?? 10_000,
        auth: destination.username && destination.password ? { username: destination.username, password: destination.password } : undefined,
        validateStatus: (status) => status >= 200 && status < 300,
      });
      return {
        status: 'success' as const,
        httpStatusCode: response.status,
        responseSummary: { statusText: response.statusText },
      };
    },
    catch: (error) => {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        return new SiemHttpError(axiosError.message, axiosError.response?.status, {
          statusText: axiosError.response?.statusText,
          data: typeof axiosError.response?.data === 'string'
            ? axiosError.response.data.slice(0, 1000)
            : axiosError.response?.data as Record<string, unknown> | undefined,
        });
      }
      return new SiemHttpError(String(error));
    },
  });
}
