import { prismaModelRow } from '../prisma/modelRow';
import { randomUUID } from 'node:crypto';
import {
  coercePersistenceQueryScalar,
  persistenceQueryFields,
  persistenceStringBounds,
  assertPersistencePatch,
} from '../scalars';
import { assertPersistencePage } from '../pagination';
import type { CorePrismaClient } from '../prisma/client';
import { prismaModelValues } from '../prisma/modelValues';
import { prismaModelFilter } from '../prisma/modelFilter';
import { prismaCommand } from '../prisma/documents';
import type { SiemRepository, SecurityEventRow, DeliveryAttemptRow } from './SiemRepository';
import { encodeSiem, siemOperation, siemFields } from './physical';
import { PersistenceError } from '../errors';

/** The same eligible predicate covers polling and the atomic claim. Null matches legacy absence. */
function readyFilter(brandId: string, now: string) {
  return {
    brandId,
    $and: [
      { $or: [{ nextEligibleAt: null }, { nextEligibleAt: { $lte: now } }] },
      {
        $or: [
          { deliveryState: { $in: ['pending', 'failed', 'partial'] } },
          { deliveryState: 'processing', leaseExpiresAt: { $lte: now } },
          { deliveryState: 'processing', leaseExpiresAt: null },
        ],
      },
    ],
  };
}
export function prismaSiemRepository(client: CorePrismaClient): SiemRepository {
  const events = client.orm.securityevent,
    attempts = client.orm.siemdeliveryattempt;
  const event = (row: Record<string, unknown> | null) => prismaModelRow<SecurityEventRow>(row);
  const history = (row: Record<string, unknown>) => prismaModelRow<DeliveryAttemptRow>(row)!;
  const filter = (value: object, kind: 'events' | 'attempts') => {
    const allowed =
      kind === 'events'
        ? ['brandId', 'eventId', 'eventType', 'category', 'severity', 'deliveryState', 'occurredAt']
        : ['brandId', 'eventId', 'destinationId', 'status', 'startedAt'];
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (!allowed.includes(key)) throw new PersistenceError('invalid-siem', 'Unsupported SIEM filter.');
      result[key] =
        key === 'occurredAt' || key === 'startedAt'
          ? persistenceStringBounds(v)
          : coercePersistenceQueryScalar(v, 'string');
    }
    return prismaModelFilter(result);
  };
  return {
    capture: input =>
      siemOperation(async () => {
        const values = prismaModelValues(encodeSiem('securityevent', input));
        try {
          await events.create(values);
        } catch (error) {
          if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
          if (!(await events.where(prismaModelFilter({ eventId: values.eventId, brandId: values.brandId })).first()))
            throw error;
        }
      }),
    findEvent: (eventId, brandId) =>
      siemOperation(async () =>
        event(await events.where(prismaModelFilter(persistenceQueryFields({ eventId, brandId }))).first())
      ),
    listEvents: (where, skip, limit) =>
      siemOperation(async () => {
        assertPersistencePage([skip, limit], 'invalid-siem');
        const query = filter(where, 'events');
        return limit === 0
          ? []
          : (await events.where(query).orderBy({ occurredAt: -1 }).offset(skip).limit(limit).all().toArray()).map(
              row => event(row)!
            );
      }),
    countEvents: where =>
      siemOperation(
        async () =>
          (
            await prismaCommand<{ total: number } | undefined>(
              client,
              client.query.from('securityevent').match(filter(where, 'events')).count('total').build()
            )
          )?.total ?? 0
      ),
    appendAttempt: input =>
      siemOperation(async () => {
        await attempts.create(prismaModelValues(encodeSiem('siemdeliveryattempt', input)));
      }),
    listAttempts: (where, skip, limit) =>
      siemOperation(async () => {
        assertPersistencePage([skip, limit], 'invalid-siem');
        const query = filter(where, 'attempts');
        return limit === 0
          ? []
          : (await attempts.where(query).orderBy({ startedAt: -1 }).offset(skip).limit(limit).all().toArray()).map(
              history
            );
      }),
    countAttempts: where =>
      siemOperation(
        async () =>
          (
            await prismaCommand<{ total: number } | undefined>(
              client,
              client.query.from('siemdeliveryattempt').match(filter(where, 'attempts')).count('total').build()
            )
          )?.total ?? 0
      ),
    readyEvents: (brandId, limit) =>
      siemOperation(async () => {
        let query = events
          .where(prismaModelFilter(readyFilter(brandId, new Date().toISOString())))
          .orderBy({ occurredAt: 1 });
        // Native limit(0) is unbounded and a negative limit is a single batch.
        if (limit) query = query.limit(Math.abs(limit));
        return (await query.all().toArray()).map(row => event(row)!);
      }),
    claimDelivery: (candidate, leaseMs) =>
      siemOperation(async () => {
        if (!Number.isFinite(leaseMs) || leaseMs <= 0)
          throw new PersistenceError('invalid-siem', 'SIEM lease duration must be positive milliseconds.');
        const now = new Date().toISOString(),
          token = randomUUID();
        const saved = await events
          .where(prismaModelFilter({ ...readyFilter(candidate.brandId, now), eventId: candidate.eventId }))
          .update({
            deliveryState: 'processing',
            leaseToken: token,
            leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
            updatedAt: now,
          });
        if (!saved) return null;
        // A write after-image alone does not authorize external delivery: retain explicit readback.
        return event(
          await events
            .where(
              prismaModelFilter({
                eventId: candidate.eventId,
                brandId: candidate.brandId,
                leaseToken: token,
                leaseExpiresAt: { $gt: new Date().toISOString() },
              })
            )
            .first()
        );
      }),
    saveDelivery: (owned, values) =>
      siemOperation(async () => {
        if (!owned.leaseToken) return false;
        assertPersistencePatch(values);
        for (const field of Object.keys(values))
          if (!Object.hasOwn(siemFields.securityevent, field) && !['createdAt', 'updatedAt'].includes(field))
            throw new PersistenceError(
              'invalid-siem',
              'Declare real stored SIEM fields in the Prisma contract before writing them.'
            );
        const now = new Date().toISOString();
        return !!(await events
          .where(
            prismaModelFilter({
              eventId: owned.eventId,
              brandId: owned.brandId,
              leaseToken: owned.leaseToken,
              leaseExpiresAt: { $gt: now },
            })
          )
          .update({ ...values, updatedAt: now }));
      }),
    cleanupDeadLetters: (brandId, cutoff, limit) =>
      siemOperation(async () => {
        const filter = {
          brandId,
          deliveryState: 'deadLetter',
          $or: [
            { terminalAt: { $lte: cutoff, $type: 'string' } },
            { terminalAt: { $exists: false }, updatedAt: { $lte: cutoff } },
          ],
        };
        let query = events.where(prismaModelFilter(filter)).orderBy({ occurredAt: 1 });
        if (limit) query = query.limit(Math.abs(limit));
        for (const row of await query.all().toArray()) {
          await attempts.where(prismaModelFilter({ eventId: row.eventId, brandId })).deleteAndCount();
          await events.where(prismaModelFilter({ ...filter, eventId: row.eventId })).deleteAndCount();
        }
      }),
  };
}
