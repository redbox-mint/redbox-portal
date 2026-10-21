import type { PublicationSyncModel } from '../../../src/model/storage/PublicationSyncModel';
import type { PublicationSourceState } from '../../../src/services/publication/contracts';
import { PublicationPublishing } from '../../../src/configmodels/PublicationPublishing';

export function statusFixture() {
  const config = new PublicationPublishing();
  config.processing.enabled = true;
  for (const id of ['main', 'second', 'oni'])
    config.destinations[id] = {
      provider: id === 'oni' ? 'oni' : 'figshare',
      displayName: `Destination ${id}`,
      enabled: true,
      archived: false,
      connection: { token: 'secret-credential' },
      mapping: {},
      attachments: {},
      writeBack: {},
      providerOptions: {},
    };
  const state: PublicationSourceState = {
    schemaVersion: 1,
    revision: 1,
    pending: true,
    initialising: false,
    approvals: [
      {
        id: 'approval',
        epoch: 1,
        sourceRevision: 1,
        policy: {
          id: 'policy',
          version: 1,
          mode: 'approval',
          recordType: 'data',
          event: 'approve',
          destinations: ['main', 'second', 'oni'],
        },
        destinationIds: ['main', 'second', 'oni'],
        targetFingerprints: { main: 'target', second: 'target', oni: 'target' },
        configurationDigests: { main: 'config', second: 'config', oni: 'config' },
        source: { encodingVersion: 1, disk: 'private-disk', key: 'private-snapshot', digest: 'a'.repeat(64) },
        requester: { username: 'private-requester', userType: 'local' },
        approver: { username: 'private-approver', userType: 'local' },
        grantedAt: '2026-10-19T00:00:00Z',
      },
    ],
    intents: {},
    saves: [],
  };
  for (const id of ['main', 'second', 'oni'])
    state.intents[id] = {
      destinationId: id,
      generation: 1,
      approvalId: 'approval',
      approvalEpoch: 1,
      sourceRevision: 1,
      pending: true,
      requestedAt: '2026-10-19T00:00:00Z',
    };
  state.saves.push({
    token: 'private-save-token',
    outcome: 'ready',
    intents: Object.values(state.intents),
    requestedAt: '2026-10-19T00:00:00Z',
    sourceRevision: 1,
    recordDigest: 'record-digest',
  });
  const row = (destinationId = 'main'): PublicationSyncModel => ({
    brandId: 'brand',
    oid: 'record',
    destinationId,
    schemaVersion: 1,
    providerId: config.destinations[destinationId].provider,
    providerStateVersion: 1,
    providerState: { payload: 'private-payload', token: 'secret-credential' },
    revision: 1,
    sourceGeneration: 1,
    sourceRevision: 1,
    approvalId: 'approval',
    approvalEpoch: 1,
    sourceDigest: 'digest',
    source: state.approvals[0].source,
    recoverySources: [],
    configurationDigest: 'config',
    targetFingerprint: 'target',
    lease: null,
    dispatchUntil: 0,
    nextActionAt: null,
    work: {
      synchronise: { requested: 1, processed: 1, dueAt: null },
      observe: { requested: 0, processed: 0, dueAt: null },
      maintenance: { requested: 0, processed: 0, dueAt: null },
    },
    status: 'completed',
    operations: [],
    binding: { namespace: 'private-namespace', objectId: destinationId, targetFingerprint: 'target', evidence: {} },
    completion: {
      approvalId: 'approval',
      approvalEpoch: 1,
      sourceGeneration: 1,
      sourceDigest: 'digest',
      confirmedAt: '2026-10-19T00:01:00Z',
      remote: { namespace: 'private-namespace', objectId: destinationId },
      deposit: { publication: destinationId === 'oni' ? 'unknown' : 'published', payload: 'private-deposit' },
      ingestion: { state: 'confirmed', evidence: { token: 'secret-ingestion' } },
      visibility: 'unverified',
      accessible: false,
      embargoed: true,
    },
    links: {
      public: 'https://repository.example/item',
      signed: 'https://repository.example/private?token=secret-link',
    },
    correctionReferences: [],
  });
  return { config, state, row };
}
