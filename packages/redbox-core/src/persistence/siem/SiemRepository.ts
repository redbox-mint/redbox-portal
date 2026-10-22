/** Plain SIEM envelopes and delivery history; no models, native filters or handles. */
export interface SecurityEventRow {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  eventId: string;
  brandId: string;
  portalId?: string;
  eventType: string;
  category: string;
  severity: string;
  occurredAt: string;
  source: string;
  actor?: Record<string, unknown> | null;
  subject?: Record<string, unknown> | null;
  resource?: Record<string, unknown> | null;
  requestContext?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  correlationId?: string;
  traceId?: string;
  deliveryState: string;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
  nextEligibleAt?: string | null;
  terminalAt?: string | null;
  destinationStates?: Record<string, unknown> | null;
}
export interface DeliveryAttemptRow extends Record<string, unknown> {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  eventId: string;
  brandId: string;
  destinationId: string;
  adapterType: string;
  attemptNumber: number;
  leaseToken?: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  httpStatusCode?: number;
  responseSummary?: Record<string, unknown> | null;
  errorSummary?: Record<string, unknown> | null;
}
export interface SiemEventFilter {
  brandId?: string;
  eventId?: string;
  eventType?: string;
  category?: string;
  severity?: string;
  deliveryState?: string;
  occurredAt?: { '>='?: string; '<='?: string };
}
export interface SiemAttemptFilter {
  brandId?: string;
  eventId?: string;
  destinationId?: string;
  status?: string;
  startedAt?: { '>='?: string; '<='?: string };
}
export interface SiemRepository {
  capture(event: Record<string, unknown>): Promise<void>;
  findEvent(eventId: string, brandId: string): Promise<SecurityEventRow | null>;
  listEvents(filter: SiemEventFilter, skip: number, limit: number): Promise<SecurityEventRow[]>;
  countEvents(filter: SiemEventFilter): Promise<number>;
  appendAttempt(attempt: Record<string, unknown>): Promise<void>;
  listAttempts(filter: SiemAttemptFilter, skip: number, limit: number): Promise<DeliveryAttemptRow[]>;
  countAttempts(filter: SiemAttemptFilter): Promise<number>;
  readyEvents(brandId: string, limit: number): Promise<SecurityEventRow[]>;
  claimDelivery(event: SecurityEventRow, leaseMs: number): Promise<SecurityEventRow | null>;
  saveDelivery(event: SecurityEventRow, values: Record<string, unknown>): Promise<boolean>;
  cleanupDeadLetters(brandId: string, cutoff: string, limit: number): Promise<void>;
}
