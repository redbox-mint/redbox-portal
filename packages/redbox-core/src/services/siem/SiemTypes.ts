import type { SiemDestinationConfig, SiemEventCategory, SiemRedactionConfig, SiemSeverity } from '../../configmodels/SiemConfiguration';
import type { SecurityEventAttributes } from '../../waterline-models/SecurityEvent';

export interface SecurityEventInput {
  brandId: string;
  portalId?: string;
  eventType: string;
  category: SiemEventCategory;
  severity?: SiemSeverity;
  occurredAt?: string;
  source: string;
  actor?: Record<string, unknown>;
  subject?: Record<string, unknown>;
  resource?: Record<string, unknown>;
  requestContext?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  correlationId?: string;
  traceId?: string;
}

export interface SiemPayload {
  body: unknown;
  headers: Record<string, string>;
}

export interface SiemDeliveryResult {
  status: 'success' | 'failed';
  httpStatusCode?: number;
  responseSummary?: Record<string, unknown>;
  errorSummary?: Record<string, unknown>;
}

export interface SiemTestInput {
  destination: SiemDestinationConfig;
  sampleEvent?: Partial<SecurityEventAttributes>;
  redaction?: Partial<SiemRedactionConfig>;
}
