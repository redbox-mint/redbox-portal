import { persistenceIndexPreflight } from '../indexPreflight';
import type { PersistenceIndex } from '../indexes';
import { siemFields } from './physical';

export const siemIndexes: readonly PersistenceIndex[] = [
  {
    datastore: 'mongodb',
    collection: 'securityevent',
    name: 'eventId_1',
    keys: {
      eventId: 1,
    },
    unique: true,
  },
  {
    datastore: 'mongodb',
    collection: 'securityevent',
    name: 'brandId_1_deliveryState_1_nextEligibleAt_1_occurredAt_1',
    keys: {
      brandId: 1,
      deliveryState: 1,
      nextEligibleAt: 1,
      occurredAt: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'securityevent',
    name: 'brandId_1_occurredAt_-1',
    keys: {
      brandId: 1,
      occurredAt: -1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'securityevent',
    name: 'brandId_1_deliveryState_1_leaseExpiresAt_1',
    keys: {
      brandId: 1,
      deliveryState: 1,
      leaseExpiresAt: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'securityevent',
    name: 'brandId_1_deliveryState_1_terminalAt_1',
    keys: {
      brandId: 1,
      deliveryState: 1,
      terminalAt: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'securityevent',
    name: 'brandId_1_deliveryState_1_updatedAt_1',
    keys: {
      brandId: 1,
      deliveryState: 1,
      updatedAt: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'siemdeliveryattempt',
    name: 'eventId_1_destinationId_1',
    keys: {
      eventId: 1,
      destinationId: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'siemdeliveryattempt',
    name: 'brandId_1_startedAt_-1',
    keys: {
      brandId: 1,
      startedAt: -1,
    },
  },
];
const preflight = persistenceIndexPreflight({
  collections: { mongodb: Object.keys(siemFields) },
  indexes: siemIndexes,
});
export const inspectSiemPersistence = preflight.inspect;
export const ensureSiemPersistenceIndexes = preflight.ensure;
