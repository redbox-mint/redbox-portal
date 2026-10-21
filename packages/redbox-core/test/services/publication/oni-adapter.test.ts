import assert from 'node:assert/strict';
import { OniWriter } from '../../../src/services/oni-v2/writer';
import { decodeOniState, decodeOniDesired } from '../../../src/services/oni-v2/publication-state';
import { createOniOcflDesiredContent, sha256 } from '../../../src/services/oni-v2/ocflReconciliation';
import { createOniPublicationProvider } from '../../../src/services/oni-v2/publication-adapter';

describe('Oni adapter contracts (PUB-11)', () => {
  it('rejects future state and malformed confirmed/submitted evidence without modifying it', () => {
    const malformed = { request: 'r', confirmed: { head: 'v1' } };
    const before = structuredClone(malformed);
    assert.throws(() => decodeOniState({}, 2), /retain evidence/);
    assert.throws(() => decodeOniState(malformed, 1), /Invalid Oni/);
    assert.throws(() => decodeOniState({ request: 'r', submitted: { operationId: 1 } }, 1), /submitted checkpoint/);
    assert.deepEqual(malformed, before);
  });
  it('verifies desired evidence digests instead of trusting persisted hashes', () => {
    const desired = createOniOcflDesiredContent('ro-crate-metadata.json', [
      { logicalPath: 'ro-crate-metadata.json', size: 2, sha256: sha256('{}') },
    ]);
    assert.deepEqual(decodeOniDesired(desired), desired);
    assert.throws(() => decodeOniDesired({ ...desired, digest: '0'.repeat(64) }), /digest/);
  });
  it('waits for every writer operation and refuses new I/O after issuing a positive receipt', async () => {
    const writer = new OniWriter();
    let release!: () => void;
    const pending = writer.track(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        })
    );
    await Promise.resolve();
    let settled = false;
    const draining = writer.settle().then(result => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    assert.equal(settled, false);
    release();
    await pending;
    assert.equal(await draining, true);
    let sends = 0;
    await assert.rejects(
      writer.track(async () => {
        sends++;
      }),
      /closed/
    );
    assert.equal(sends, 0);
  });
  it('does not report quiescence from a rejected request and drains a slower sibling', async () => {
    const writer = new OniWriter();
    let release!: () => void;
    const pending = writer.track(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        })
    );
    await assert.rejects(
      writer.track(async () => {
        throw new Error('unknown remote result');
      })
    );
    let drained = false;
    const settling = writer.settle().then(result => {
      drained = true;
      return result;
    });
    await Promise.resolve();
    assert.equal(drained, false);
    release();
    await pending;
    assert.equal(await settling, false);
  });
  it('never claims object visibility from a confirmed deposit or repository index', () => {
    const provider = createOniPublicationProvider(() => {
      throw new Error('Status must be pure');
    });
    assert.deepEqual(provider.summariseStatus!({ confirmed: {}, ingestion: { state: 'confirmed' } }), {
      deposit: 'confirmed',
      publication: 'unverified',
      ingestion: 'confirmed',
      visibility: 'unverified',
    });
  });
});
