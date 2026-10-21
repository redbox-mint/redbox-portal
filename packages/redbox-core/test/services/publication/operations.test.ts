import { expect } from 'chai';
import { publicationOperationIdempotencyKey } from '../../../src/services/publication/operations';
import type { PublicationOperation } from '../../../src/services/publication/contracts';
import { PublicationProviderRegistry } from '../../../src/services/publication/registry';
import { reviewProvider } from '../../fixtures/publication/provider';

describe('Publication operation idempotency and recovery declarations', () => {
  const work = {
    brandId: 'brand',
    oid: 'record',
    destinationId: 'archive',
    providerId: 'review-ledger',
    targetFingerprint: 'target',
  };
  const operation: PublicationOperation = {
    id: 'durable-operation',
    kind: 'submit',
    approvalId: 'approval',
    approvalEpoch: 1,
    sourceGeneration: 2,
    intendedDigest: 'sealed-dossier',
    submittedAt: '2026-10-21T00:00:00Z',
    outcome: 'submitted',
    evidence: {},
  };
  it('keeps one transport key across lost responses, outcome evidence, acknowledgement and process reconstruction', () => {
    const key = publicationOperationIdempotencyKey(work, operation);
    expect(key).to.match(/^rbpub-v1-[a-f0-9]{64}$/);
    for (const outcome of ['submitted', 'uncertain', 'confirmed', 'not_applied', 'rejected'] as const)
      expect(
        publicationOperationIdempotencyKey(structuredClone(work), {
          ...structuredClone(operation),
          outcome,
          checkpointed: true,
          evidence: { receipt: 'external' },
        })
      ).to.equal(key);
  });
  it('never shares a key across different work, target, operation or intended mutation identities', () => {
    const key = publicationOperationIdempotencyKey(work, operation);
    for (const field of Object.keys(work))
      expect(publicationOperationIdempotencyKey({ ...work, [field]: 'different' }, operation)).not.to.equal(key);
    for (const field of ['id', 'kind', 'approvalId', 'intendedDigest', 'submittedAt'] as const)
      expect(publicationOperationIdempotencyKey(work, { ...operation, [field]: 'different' })).not.to.equal(key);
    for (const field of ['approvalEpoch', 'sourceGeneration'] as const)
      expect(publicationOperationIdempotencyKey(work, { ...operation, [field]: 9 })).not.to.equal(key);
  });
  it('rejects undeclared recovery and no-lookup adapters without executable attestation', () => {
    const undeclared = { ...reviewProvider };
    Reflect.deleteProperty(undeclared, 'mutationRecovery');
    expect(() => new PublicationProviderRegistry().register(undeclared)).to.throw('declare mutation recovery');
    expect(() =>
      new PublicationProviderRegistry().register({ ...reviewProvider, mutationRecovery: { mode: 'no-remote-lookup' } })
    ).to.throw('executable operator attestation');
  });
});
