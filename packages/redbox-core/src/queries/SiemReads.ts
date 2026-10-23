import type { SiemRepository } from '../persistence/siem/SiemRepository';
import type { SecurityEventRow as SecurityEventAttributes } from '../persistence/siem/SiemRepository';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export class SiemReads {
  public constructor(
    private readonly repository: Pick<SiemRepository, 'listEvents' | 'countEvents' | 'listAttempts' | 'countAttempts'>
  ) {}
  public async queryEvents(
    params: Record<string, unknown> = {}
  ): Promise<{ rows: SecurityEventAttributes[]; total: number }> {
    const requestedLimit = Number.parseInt(String(params.limit ?? 50), 10);
    const requestedSkip = Number.parseInt(String(params.skip ?? params.offset ?? 0), 10);
    const limit = Math.min(Number.isFinite(requestedLimit) ? Math.max(requestedLimit, 0) : 50, 500);
    const skip = Math.max(Number.isFinite(requestedSkip) ? requestedSkip : 0, 0);
    const where: Record<string, unknown> = {};
    ['brandId', 'eventType', 'category', 'severity', 'deliveryState'].forEach(key => {
      if (typeof params[key] === 'string' && params[key] !== '') {
        where[key] = params[key];
      }
    });
    const occurredAt: Record<string, string> = {};
    if (typeof params.occurredAtStart === 'string' && params.occurredAtStart !== '') {
      occurredAt['>='] = params.occurredAtStart;
    }
    if (typeof params.occurredAtEnd === 'string' && params.occurredAtEnd !== '') {
      occurredAt['<='] = params.occurredAtEnd;
    }
    if (Object.keys(occurredAt).length > 0) {
      where.occurredAt = occurredAt;
    }
    const rows = await this.repository.listEvents(where, skip, limit);
    const total = await this.repository.countEvents(where);
    return { rows, total };
  }
  public async getDeliveryStatus(
    params: Record<string, unknown> = {}
  ): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const requestedLimit = Number.parseInt(String(params.limit ?? 50), 10);
    const requestedSkip = Number.parseInt(String(params.skip ?? params.offset ?? 0), 10);
    const limit = Math.min(Number.isFinite(requestedLimit) ? Math.max(requestedLimit, 0) : 50, 500);
    const skip = Math.max(Number.isFinite(requestedSkip) ? requestedSkip : 0, 0);
    const where: Record<string, unknown> = {};
    ['brandId', 'eventId', 'destinationId', 'status'].forEach(key => {
      if (typeof params[key] === 'string' && params[key] !== '') {
        where[key] = params[key];
      }
    });
    const startedAt: Record<string, string> = {};
    if (typeof params.startedAtStart === 'string' && params.startedAtStart !== '') {
      startedAt['>='] = params.startedAtStart;
    }
    if (typeof params.startedAtEnd === 'string' && params.startedAtEnd !== '') {
      startedAt['<='] = params.startedAtEnd;
    }
    if (Object.keys(startedAt).length > 0) {
      where.startedAt = startedAt;
    }
    const rows = await this.repository.listAttempts(where, skip, limit);
    const total = await this.repository.countAttempts(where);
    return { rows: Array.isArray(rows) ? rows.filter(isRecord) : [], total };
  }
}
