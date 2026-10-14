import { Effect, Layer } from 'effect';
import { IntegrationAuditAction, IntegrationAuditName } from '../../model/storage/IntegrationAuditModel';
import type { IntegrationAuditContext } from '../IntegrationAuditService';
import { RaidAuditTag, RaidRunContextTag } from './tags';

export interface AuditAdapter {
  startAudit(oid: string, action: IntegrationAuditAction, options: Record<string, unknown>): IntegrationAuditContext | null;
  completeAudit(ctx: IntegrationAuditContext | null, details?: Record<string, unknown>): void;
  failAudit(ctx: IntegrationAuditContext | null, error: unknown, details?: Record<string, unknown>): void;
}

export function makeAuditLayer(adapter?: AuditAdapter) {
  return Layer.effect(RaidAuditTag, Effect.gen(function* () {
    const context = yield* RaidRunContextTag;
    const bestEffort = <A>(fn: () => A, fallback: A): Effect.Effect<A> => Effect.try({ try: fn, catch: () => fallback }).pipe(Effect.catchAll(() => Effect.succeed(fallback)));
    return {
      start(action: string, summary: Record<string, unknown> = {}, parent?: IntegrationAuditContext | null) {
        if (!adapter) return Effect.succeed(null);
        return bestEffort(() => adapter.startAudit(context.oid, action as IntegrationAuditAction, {
          integrationName: IntegrationAuditName.raid, brandId: context.brandId, triggeredBy: context.triggerSource,
          requestSummary: summary, traceId: parent?.traceId, parentSpanId: parent?.spanId
        }), null);
      },
      complete(ctx: IntegrationAuditContext | null, details: Record<string, unknown> = {}) {
        return bestEffort(() => adapter?.completeAudit(ctx, details), undefined);
      },
      fail(ctx: IntegrationAuditContext | null, error: unknown, details: Record<string, unknown> = {}) {
        return bestEffort(() => adapter?.failAudit(ctx, error, details), undefined);
      }
    };
  }));
}
